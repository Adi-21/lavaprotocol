// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

// --- INTERFACES ---
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}
interface IWcBTC is IERC20 { function deposit() external payable; function withdraw(uint256) external; }
interface IUSDC is IERC20 {}
interface IZentraPool {
    function supply(address,uint256,address,uint16) external;
    function withdraw(address,uint256,address) external returns(uint256);
    function borrow(address,uint256,uint256,uint16,address) external;
    function repay(address,uint256,uint256,address) external returns(uint256);
    function getUserAccountData(address) external view returns(uint256,uint256,uint256,uint256,uint256,uint256);
}
interface ISatsumaRouter {
    struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns(uint256);
}
interface IPriceOracle {
    function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80);
}

contract LavaMaximizedVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    IWcBTC public immutable asset;
    IUSDC public immutable USDC;
    IZentraPool public immutable ZENTRA_POOL;
    ISatsumaRouter public immutable SATSUMA_ROUTER;
    IPriceOracle public immutable BTC_USD_ORACLE;
    uint256 public activeStrategy;
    uint256 public totalCollateral;
    uint256 public totalDebtInUsd;

    event Leveraged(address indexed user, uint256 initialDeposit, uint256 leverageLoops, uint256 finalCollateral, uint256 totalDebt);
    event Deleveraged(address indexed user, uint256 sharesBurnt, uint256 assetsWithdrawn, uint256 debtRepaid);
    event EmergencyDeleveraged(uint256 collateralSold, uint256 debtRepaid, uint256 healthFactorBefore);

    constructor(
        IWcBTC _wcbtc, IUSDC _usdc, IZentraPool _zentraPool,
        ISatsumaRouter _satsumaRouter, IPriceOracle _btcUsdOracle
    ) ERC20("Lava Maximized cBTC", "mcBTC") Ownable(msg.sender) {
        asset = _wcbtc;
        USDC = _usdc;
        ZENTRA_POOL = _zentraPool;
        SATSUMA_ROUTER = _satsumaRouter;
        BTC_USD_ORACLE = _btcUsdOracle;
        IERC20(_wcbtc).approve(address(_zentraPool), type(uint256).max);
        IERC20(_wcbtc).approve(address(_satsumaRouter), type(uint256).max);
    }

    // --- Core Accounting & Full ERC-4626 Interface ---
    function totalAssets() public view returns (uint256) {
        if (totalCollateral == 0) return 0;
        (,int256 btcPrice,,,) = BTC_USD_ORACLE.latestRoundData();
        uint256 collateralValueUsd = (totalCollateral * uint256(btcPrice)) / 1e8;
        if (collateralValueUsd <= totalDebtInUsd) return 0;
        uint256 navUsd = collateralValueUsd - totalDebtInUsd;
        return (navUsd * 1e8) / uint256(btcPrice);
    }
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }
    function maxDeposit(address) public pure returns (uint256) { return type(uint256).max; }
    function maxMint(address) public pure returns (uint256) { return type(uint256).max; }
    function maxWithdraw(address owner) public view returns (uint256) { return convertToAssets(balanceOf(owner)); }
    function maxRedeem(address owner) public view returns (uint256) { return balanceOf(owner); }
    function previewDeposit(uint256 assets) public view returns (uint256) { return convertToShares(assets); }
    function previewMint(uint256 shares) public view returns (uint256) { return convertToAssets(shares); }
    function previewWithdraw(uint256 assets) public view returns (uint256) { return convertToShares(assets); }
    function previewRedeem(uint256 shares) public view returns (uint256) { return convertToAssets(shares); }

    // --- User-Facing Functions ---
    function deposit(uint256 _leverageLoops, address receiver) external payable nonReentrant whenNotPaused {
        require(activeStrategy == 3, "Only Zentra Leverage strategy is active");
        require(msg.value > 0, "Deposit must be > 0");
        uint256 assetsToDeposit = msg.value;
        asset.deposit{value: assetsToDeposit}();
        _mint(receiver, convertToShares(assetsToDeposit));
        _executeZentraLeverage(assetsToDeposit, _leverageLoops);
        emit Leveraged(receiver, assetsToDeposit, _leverageLoops, totalCollateral, totalDebtInUsd);
    }
    function withdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused {
        uint256 assetsToWithdraw = convertToAssets(shares);
        require(assetsToWithdraw > 0, "Withdraw amount must be > 0");
        _burn(msg.sender, shares);
        uint256 debtRepaid = _unwindZentraLeverage(assetsToWithdraw);
        asset.withdraw(assetsToWithdraw);
        (bool sent, ) = receiver.call{value: assetsToWithdraw}("");
        require(sent, "Failed to send cBTC");
        emit Deleveraged(msg.sender, shares, assetsToWithdraw, debtRepaid);
    }

    // --- Strategy 3: Zentra Leverage ---
    function _executeZentraLeverage(uint256 initialDeposit, uint256 loops) internal {
        ZENTRA_POOL.supply(address(asset), initialDeposit, address(this), 0);
        totalCollateral += initialDeposit;
        for (uint i = 0; i < loops; i++) {
            (,,,,uint256 ltv,) = ZENTRA_POOL.getUserAccountData(address(this));
            uint256 collateralValueUsd = (totalCollateral * getBtcPrice()) / 1e8;
            uint256 maxDebt = (collateralValueUsd * ltv) / 10000;
            if (maxDebt <= totalDebtInUsd) break;
            uint256 debtToTake = maxDebt - totalDebtInUsd;
            uint256 usdcToBorrow = debtToTake / 1e12;
            ZENTRA_POOL.borrow(address(USDC), usdcToBorrow, 2, 0, address(this));
            totalDebtInUsd += (usdcToBorrow * 1e12);
            USDC.approve(address(SATSUMA_ROUTER), usdcToBorrow);
            ISatsumaRouter.ExactInputSingleParams memory params = ISatsumaRouter.ExactInputSingleParams({ tokenIn: address(USDC), tokenOut: address(asset), fee: 3000, recipient: address(this), deadline: block.timestamp, amountIn: usdcToBorrow, amountOutMinimum: 0, sqrtPriceLimitX96: 0 });
            uint256 wcbtcReceived = SATSUMA_ROUTER.exactInputSingle(params);
            ZENTRA_POOL.supply(address(asset), wcbtcReceived, address(this), 0);
            totalCollateral += wcbtcReceived;
        }
    }
    function _unwindZentraLeverage(uint256 amountToRedeemInWcbtc) internal returns (uint256 debtRepaid) {
        require(totalCollateral >= amountToRedeemInWcbtc, "Withdraw exceeds collateral");
        uint256 proportionalDebtUsd = (totalDebtInUsd * amountToRedeemInWcbtc) / totalCollateral;
        ZENTRA_POOL.withdraw(address(asset), amountToRedeemInWcbtc, address(this));
        totalCollateral -= amountToRedeemInWcbtc;
        uint256 usdcToRepay = proportionalDebtUsd / 1e12;
        if (usdcToRepay > 0) {
            uint256 wcbtcToSellForRepay = (usdcToRepay * 1e8 * 101) / (getBtcPrice() * 100);
            if (wcbtcToSellForRepay > amountToRedeemInWcbtc) wcbtcToSellForRepay = amountToRedeemInWcbtc;
            asset.approve(address(SATSUMA_ROUTER), wcbtcToSellForRepay);
            ISatsumaRouter.ExactInputSingleParams memory params = ISatsumaRouter.ExactInputSingleParams({ tokenIn: address(asset), tokenOut: address(USDC), fee: 3000, recipient: address(this), deadline: block.timestamp, amountIn: wcbtcToSellForRepay, amountOutMinimum: 0, sqrtPriceLimitX96: 0 });
            uint256 usdcReceived = SATSUMA_ROUTER.exactInputSingle(params);
            usdcToRepay = usdcReceived < usdcToRepay ? usdcReceived : usdcToRepay;
            uint256 repaidAmount = ZENTRA_POOL.repay(address(USDC), usdcToRepay, 2, address(this));
            debtRepaid = repaidAmount * 1e12;
            totalDebtInUsd -= debtRepaid;
        }
    }

    // --- Risk Management ---
    function getHealthFactor() public view returns (uint256) {
        if (activeStrategy == 3) { (,,,, , uint256 hf) = ZENTRA_POOL.getUserAccountData(address(this)); return hf; } return type(uint256).max;
    }
    function getLeverageRatio() external view returns (uint256) {
        if (totalCollateral == 0) return 1e18;
        uint256 collateralValueUsd = (totalCollateral * getBtcPrice()) / 1e8;
        if (totalDebtInUsd >= collateralValueUsd) return type(uint256).max;
        if (totalDebtInUsd == 0) return 1e18;
        return (collateralValueUsd * 1e18) / (collateralValueUsd - totalDebtInUsd);
    }
    function emergencyDeleverage() external onlyOwner {
        uint256 hf = getHealthFactor();
        require(hf < 1.1e18, "Health factor not critical");
        if (totalDebtInUsd > 0) {
            uint256 usdcDebt = totalDebtInUsd / 1e12;
            uint256 wcbtcToSell = ((usdcDebt * 1e8) / getBtcPrice()) * 105 / 100;
            if(wcbtcToSell > totalCollateral) wcbtcToSell = totalCollateral;
            ZENTRA_POOL.withdraw(address(asset), wcbtcToSell, address(this));
            totalCollateral -= wcbtcToSell;
            asset.approve(address(SATSUMA_ROUTER), wcbtcToSell);
            ISatsumaRouter.ExactInputSingleParams memory params = ISatsumaRouter.ExactInputSingleParams({ tokenIn: address(asset), tokenOut: address(USDC), fee: 3000, recipient: address(this), deadline: block.timestamp, amountIn: wcbtcToSell, amountOutMinimum: 0, sqrtPriceLimitX96: 0 });
            SATSUMA_ROUTER.exactInputSingle(params);
            uint256 repaidUsd = ZENTRA_POOL.repay(address(USDC), type(uint256).max, 2, address(this)) * 1e12;
            totalDebtInUsd -= repaidUsd;
            emit EmergencyDeleveraged(wcbtcToSell, repaidUsd, hf);
        }
    } 

    // --- Admin & Safety ---
    function setActiveStrategy(uint256 _strategyId) external onlyOwner {
        require(totalAssets() == 0, "Vault must be empty");
        require(_strategyId >= 3 && _strategyId <= 5, "Invalid strategy ID");
        activeStrategy = _strategyId;
    }
    function getBtcPrice() public pure returns (uint256) {
        // Fixed price for hackathon demo: $119,670 with 8 decimals
        return 119670 * 1e8;
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    receive() external payable {}
}

