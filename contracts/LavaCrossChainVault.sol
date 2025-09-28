// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}
interface IWcBTC is IERC20 { function deposit() external payable; function withdraw(uint256) external; }
interface IUSDC is IERC20 {}
interface IZentraPool {
    function supply(address,uint256,address,uint16) external;
    function withdraw(address,uint256,address) external returns(uint256);
    function borrow(address,uint256,uint256,uint16,address) external;
    function repay(address,uint256,uint256,address) external returns(uint256);
}
interface IBridge {
    function bridgeOut(address token, uint256 amount) external;
    function forwardToYieldSource(address token, uint256 amount) external;
    function pullFromYieldSource(address token, uint256 amount) external;
    function bridgeIn(address token, uint256 amount, address recipient) external;
}
interface IYieldSourceView { function totalAssets(address token) external view returns (uint256); }

contract LavaCrossChainVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    IWcBTC public immutable asset;          // WcBTC (8 decimals)
    IUSDC public immutable USDC;           // USDC (6 decimals)
    IZentraPool public immutable ZENTRA;   // Collateral/borrow venue
    IBridge public immutable BRIDGE;       // MockBridge
    IYieldSourceView public immutable YIELD;// MockInstitutionalYieldSource (view)

    // Strategy 6 state
    uint256 public totalCollateralWc;      // in WcBTC units (8d)
    uint256 public totalDebtUsd;           // in USD with 6+6 = 12 decimals for simplicity
    uint256 public initialBridgedUsd;      // amount sent to yield source (USDC, 6d)

    event Deposited(address indexed user, uint256 cbtcIn, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 cbtcOut);
    event ExecutedCrossChain(uint256 depositWc, uint256 usdcBorrowed);
    event Harvested(uint256 profitUsd, uint256 newDebtUsd, uint256 collateralWc);

    constructor(
        IWcBTC _wcbtc,
        IUSDC _usdc,
        IZentraPool _zentra,
        IBridge _bridge,
        IYieldSourceView _yield
    ) ERC20("Lava Cross-Chain cBTC", "xcBTC") Ownable(msg.sender) {
        asset = _wcbtc;
        USDC = _usdc;
        ZENTRA = _zentra;
        BRIDGE = _bridge;
        YIELD = _yield;
        IERC20(_wcbtc).approve(address(_zentra), type(uint256).max);
    }

    // Fixed price: $119,670 per BTC with 8 decimals on WcBTC
    function getBtcPrice() public pure returns (uint256) { return 119670 * 1e8; }

    // Value of vault = collateralValueUsd - debtUsd converted back to WcBTC
    function totalAssets() public view returns (uint256) {
        if (totalCollateralWc == 0) return 0;
        uint256 collateralUsd = (totalCollateralWc * getBtcPrice()) / 1e8; // 8d*8d/8d=8d -> treat as 8d USD; scale to 12d below
        uint256 collateralUsd12 = collateralUsd * 1e4; // 8d -> 12d
        if (collateralUsd12 <= totalDebtUsd) return 0;
        uint256 navUsd12 = collateralUsd12 - totalDebtUsd; // 12d
        // Convert USD12 -> WcBTC8: Wc8 = (navUsd12 * 1e8 / price8) / 1e4
        return ((navUsd12 * 1e8) / getBtcPrice()) / 1e4;
    }
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    function deposit(address receiver) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "zero deposit");
        uint256 amount = msg.value; // 8d
        asset.deposit{value: amount}();
        _mint(receiver, convertToShares(amount));
        _executeCrossChainYield(amount);
        emit Deposited(receiver, amount, balanceOf(receiver));
    }

    function withdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused {
        uint256 assetsOut = convertToAssets(shares);
        _burn(msg.sender, shares);
        // Pull proportionally from collateral held at Zentra
        if (assetsOut > 0) {
            ZENTRA.withdraw(address(asset), assetsOut, address(this));
            totalCollateralWc = totalCollateralWc > assetsOut ? totalCollateralWc - assetsOut : 0;
        }
        asset.withdraw(assetsOut);
        (bool sent, ) = receiver.call{value: assetsOut}("");
        require(sent, "send failed");
        emit Withdrawn(msg.sender, shares, assetsOut);
    }

    function _executeCrossChainYield(uint256 initialDepositWc) internal {
        // 1) Supply WcBTC as collateral
        ZENTRA.supply(address(asset), initialDepositWc, address(this), 0);
        totalCollateralWc += initialDepositWc;
        // 2) Borrow conservative 20% LTV in USD terms
        uint256 borrowUsd12 = ((initialDepositWc * getBtcPrice()) / 1e8) * 2000 / 10000 * 1e4; // 12d
        uint256 usdcToBorrow = borrowUsd12 / 1e6; // 12d -> 6d
        if (usdcToBorrow > 0) {
            ZENTRA.borrow(address(USDC), usdcToBorrow, 2, 0, address(this));
            totalDebtUsd += usdcToBorrow * 1e6; // 6d -> 12d
            // 3) Bridge out to external chain and forward to yield source
            USDC.approve(address(BRIDGE), usdcToBorrow);
            BRIDGE.bridgeOut(address(USDC), usdcToBorrow);
            BRIDGE.forwardToYieldSource(address(USDC), usdcToBorrow);
            initialBridgedUsd += usdcToBorrow;
        }
        emit ExecutedCrossChain(initialDepositWc, usdcToBorrow);
    }

    function harvestCrossChainYield() external onlyOwner nonReentrant {
        // Profit = yieldSource.totalAssets(USDC) - initialBridgedUsd
        uint256 totalAtYS = YIELD.totalAssets(address(USDC)); // 6d
        require(totalAtYS >= initialBridgedUsd, "no profit");
        uint256 profitUsdc = totalAtYS - initialBridgedUsd; // 6d
        if (profitUsdc == 0) return;
        // Pull back profit via bridge
        BRIDGE.pullFromYieldSource(address(USDC), profitUsdc);
        BRIDGE.bridgeIn(address(USDC), profitUsdc, address(this));
        // Use profit to repay USDC debt to increase NAV
        USDC.approve(address(ZENTRA), profitUsdc);
        uint256 repaid = ZENTRA.repay(address(USDC), profitUsdc, 2, address(this));
        uint256 repaidUsd12 = repaid * 1e6;
        if (repaidUsd12 > totalDebtUsd) {
            repaidUsd12 = totalDebtUsd;
        }
        totalDebtUsd -= repaidUsd12;
        emit Harvested(repaid, totalDebtUsd, totalCollateralWc);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    receive() external payable {}
}


