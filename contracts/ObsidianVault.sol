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
interface IWcBTC is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
interface IZToken is IERC20 {}
interface IZentraPool {
    function supply(address,uint256,address,uint16) external;
    function withdraw(address,uint256,address) external returns(uint256);
    function getReserveData(address) external view returns(uint256,uint128,uint128,uint128,uint128,uint128,uint40,address,address,address,address,uint8);
}
interface ISatsumaLPVault is IERC20 {
    function deposit(uint256,address) external returns(uint256);
    function withdraw(uint256,address,address) external returns(uint256);
    function totalAssets() external view returns(uint256);
}

contract LavaOptimizedVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    IWcBTC public immutable asset;
    IZentraPool public immutable ZENTRA_POOL;
    ISatsumaLPVault public immutable SATSUMA_LP_VAULT;
    IZToken public immutable Z_TOKEN;
    struct Strategy { uint128 allocationBps; }
    mapping(uint256 => Strategy) public strategies;
    uint256 public totalAllocationBps;
    uint256 public constant TOTAL_BPS = 10000;

    event Deposited(address indexed user, uint256 cbtcAmount, uint256 sharesMinted);
    event Withdrawn(address indexed user, uint256 sharesBurnt, uint256 cbtcAmount);
    event Rebalanced(int256 zentraDelta, int256 satsumaDelta);
    event AllocationSet(uint256 indexed strategyId, uint256 bps);

    constructor(
        IWcBTC _wcbtc,
        IZentraPool _zentraPool,
        ISatsumaLPVault _satsumaLPVault
    ) ERC20("Lava Optimized cBTC", "ocBTC") Ownable(msg.sender) {
        asset = _wcbtc;
        ZENTRA_POOL = _zentraPool;
        SATSUMA_LP_VAULT = _satsumaLPVault;
        (, , , , , , , address zTokenAddress, , , , ) = _zentraPool.getReserveData(address(_wcbtc));
        require(zTokenAddress != address(0), "Invalid zToken address");
        Z_TOKEN = IZToken(zTokenAddress);
        IERC20(_wcbtc).approve(address(_zentraPool), type(uint256).max);
        IERC20(_wcbtc).approve(address(_satsumaLPVault), type(uint256).max);
    }

    // --- Core Accounting & Full ERC-4626 Interface ---
    function totalAssets() public view returns (uint256) {
        uint256 totalValue = 0;
        totalValue += Z_TOKEN.balanceOf(address(this));
        totalValue += SATSUMA_LP_VAULT.totalAssets();
        totalValue += asset.balanceOf(address(this));
        return totalValue;
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
    function deposit(address receiver) external payable nonReentrant whenNotPaused {
        uint256 assetsToDeposit = msg.value;
        require(assetsToDeposit > 0, "Deposit must be > 0");
        asset.deposit{value: assetsToDeposit}();
        _mint(receiver, convertToShares(assetsToDeposit));
        _deploy(assetsToDeposit);
        emit Deposited(receiver, assetsToDeposit, balanceOf(receiver));
    }
    function withdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused {
        uint256 assetsToWithdraw = convertToAssets(shares);
        require(assetsToWithdraw > 0, "Withdraw amount must be > 0");
        _burn(msg.sender, shares);
        _liquidate(assetsToWithdraw);
        asset.withdraw(assetsToWithdraw);
        (bool sent, ) = receiver.call{value: assetsToWithdraw}("");
        require(sent, "Failed to send cBTC");
        emit Withdrawn(msg.sender, shares, assetsToWithdraw);
    }

    // --- Internal Strategy Mechanics ---
    function _deploy(uint256 amount) internal {
        uint256 zentraAmount = (amount * strategies[1].allocationBps) / TOTAL_BPS;
        uint256 satsumaAmount = amount - zentraAmount;
        if (zentraAmount > 0) ZENTRA_POOL.supply(address(asset), zentraAmount, address(this), 0);
        if (satsumaAmount > 0) ISatsumaLPVault(address(SATSUMA_LP_VAULT)).deposit(satsumaAmount, address(this));
    }
    function _liquidate(uint256 amount) internal {
        uint256 currentTotalAssets = totalAssets();
        if (currentTotalAssets == 0) return;
        uint256 zentraValue = Z_TOKEN.balanceOf(address(this));
        uint256 zentraWithdraw = (amount * zentraValue) / currentTotalAssets;
        if (zentraWithdraw > 0) ZENTRA_POOL.withdraw(address(asset), zentraWithdraw, address(this));
        uint256 satsumaWithdraw = amount - zentraWithdraw;
        if (satsumaWithdraw > 0) ISatsumaLPVault(address(SATSUMA_LP_VAULT)).withdraw(satsumaWithdraw, address(this), address(this));
    }

    // --- Admin & Safety Functions ---
    function setAllocation(uint256 _strategyId, uint128 _bps) external onlyOwner {
        require(_strategyId == 1 || _strategyId == 2, "Invalid strategy ID");
        uint256 oldBps = strategies[_strategyId].allocationBps;
        totalAllocationBps = totalAllocationBps - oldBps + _bps;
        require(totalAllocationBps <= TOTAL_BPS, "Total allocation exceeds 100%");
        strategies[_strategyId].allocationBps = _bps;
        emit AllocationSet(_strategyId, _bps);
    }
    
    function rebalance() external onlyOwner nonReentrant {
        uint256 currentTotalAssets = totalAssets();
        if (currentTotalAssets == 0) return;
        uint256 zentraCurrent = Z_TOKEN.balanceOf(address(this));
        uint256 zentraTarget = (currentTotalAssets * strategies[1].allocationBps) / TOTAL_BPS;
        int256 zentraDelta;
        int256 satsumaDelta;
        if (zentraCurrent > zentraTarget) {
            uint256 pullAmount = zentraCurrent - zentraTarget;
            ZENTRA_POOL.withdraw(address(asset), pullAmount, address(this));
            ISatsumaLPVault(address(SATSUMA_LP_VAULT)).deposit(pullAmount, address(this));
            zentraDelta = -int256(pullAmount);
            satsumaDelta = int256(pullAmount);
        } else if (zentraCurrent < zentraTarget) {
            uint256 pushAmount = zentraTarget - zentraCurrent;
            ISatsumaLPVault(address(SATSUMA_LP_VAULT)).withdraw(pushAmount, address(this), address(this));
            ZENTRA_POOL.supply(address(asset), pushAmount, address(this), 0);
            zentraDelta = int256(pushAmount);
            satsumaDelta = -int256(pushAmount);
        }
        emit Rebalanced(zentraDelta, satsumaDelta);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    receive() external payable {}
}