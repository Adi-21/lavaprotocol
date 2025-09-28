// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IStrategy } from "./interfaces/IStrategy.sol";

interface IERC20 { function approve(address spender, uint256 amount) external returns (bool); function balanceOf(address account) external view returns (uint256); function transfer(address recipient, uint256 amount) external returns (bool); function transferFrom(address sender, address recipient, uint256 amount) external returns (bool); }
interface IWcBTC is IERC20 { function deposit() external payable; function withdraw(uint256) external; }

contract LavaPortfolioVault is ERC20, ReentrancyGuard, Pausable, Ownable {
    IWcBTC public immutable asset; // WcBTC (8d)
    uint16 public reserveBps; // 0-10000
    uint16 public constant TOTAL_BPS = 10000;

    struct StrategyInfo { IStrategy adapter; uint16 allocationBps; bool enabled; }
    mapping(uint256 => StrategyInfo) public strategies; // id => info
    uint256[] public strategyIds;

    event ReserveUpdated(uint16 bps);
    event StrategyAdded(uint256 indexed id, address adapter, uint16 bps);
    event StrategyUpdated(uint256 indexed id, uint16 bps, bool enabled);
    event Invested(uint256 indexed id, uint256 amount);
    event Divested(uint256 indexed id, uint256 amount);

    constructor(IWcBTC _wcbtc, uint16 _reserveBps) ERC20("Lava Portfolio cBTC", "pcBTC") Ownable(msg.sender) {
        asset = _wcbtc;
        reserveBps = _reserveBps;
    }

    // --- Owner Setters ---
    function setReserveBps(uint16 bps) external onlyOwner {
        require(bps <= TOTAL_BPS, "bad bps");
        require(_sumAllocations() <= TOTAL_BPS - bps, "alloc>cap");
        reserveBps = bps;
        emit ReserveUpdated(bps);
    }
    function addStrategy(uint256 id, IStrategy adapter, uint16 bps) external onlyOwner {
        require(address(adapter) != address(0), "zero");
        require(!strategies[id].enabled, "exists");
        require(_sumAllocations() + bps <= TOTAL_BPS - reserveBps, "alloc>cap");
        strategies[id] = StrategyInfo({ adapter: adapter, allocationBps: bps, enabled: true });
        strategyIds.push(id);
        emit StrategyAdded(id, address(adapter), bps);
    }
    function setStrategy(uint256 id, uint16 bps, bool enabled) external onlyOwner {
        StrategyInfo storage s = strategies[id];
        require(address(s.adapter) != address(0), "no strat");
        uint256 current = _sumAllocations();
        current = current - s.allocationBps + bps;
        require(current <= TOTAL_BPS - reserveBps, "alloc>cap");
        s.allocationBps = bps;
        s.enabled = enabled;
        emit StrategyUpdated(id, bps, enabled);
    }

    // --- Views ---
    function getStrategies() external view returns (uint256[] memory ids, StrategyInfo[] memory infos) {
        ids = strategyIds;
        infos = new StrategyInfo[](ids.length);
        for (uint i=0;i<ids.length;i++) infos[i] = strategies[ids[i]];
    }
    function totalAssets() public view returns (uint256) {
        uint256 value = asset.balanceOf(address(this)); // reserve held here
        for (uint i=0;i<strategyIds.length;i++) {
            StrategyInfo storage s = strategies[strategyIds[i]];
            if (!s.enabled) continue;
            value += s.adapter.totalAssets();
        }
        return value;
    }
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    // --- User ---
    function deposit(address receiver) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "zero");
        uint256 amount = msg.value;
        asset.deposit{value: amount}();
        _mint(receiver, convertToShares(amount));
        _routeInvest(amount);
    }
    function withdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused {
        uint256 assets = convertToAssets(shares);
        _burn(msg.sender, shares);
        _routeDivest(assets);
        asset.withdraw(assets);
        (bool ok,) = receiver.call{value: assets}("");
        require(ok, "send fail");
    }

    // --- Internal routing ---
    function _routeInvest(uint256 amount) internal {
        uint256 reserve = (amount * reserveBps) / TOTAL_BPS;
        // keep reserve on this contract
        uint256 remaining = amount - reserve;
        for (uint i=0;i<strategyIds.length;i++) {
            StrategyInfo storage s = strategies[strategyIds[i]];
            if (!s.enabled || s.allocationBps == 0) continue;
            uint256 slice = (amount * s.allocationBps) / TOTAL_BPS; // proportional to total
            if (slice > remaining) slice = remaining;
            if (slice > 0) {
                // Move tokens to adapter custody; adapter consumes amount
                asset.transfer(address(s.adapter), slice);
                s.adapter.invest(slice);
                emit Invested(strategyIds[i], slice);
            }
        }
    }
    function _routeDivest(uint256 assets) internal {
        uint256 reserveBal = asset.balanceOf(address(this));
        if (reserveBal >= assets) return; // serve from reserve
        uint256 need = assets - reserveBal;
        // Pull proportionally from strategies by current weights (simple loop)
        uint256 totalStrat = 0;
        uint256[] memory vals = new uint256[](strategyIds.length);
        for (uint i=0;i<strategyIds.length;i++) {
            StrategyInfo storage s = strategies[strategyIds[i]];
            if (!s.enabled) { vals[i]=0; continue; }
            uint256 v = s.adapter.totalAssets();
            vals[i]=v; totalStrat+=v;
        }
        if (totalStrat == 0) return;
        for (uint i=0;i<strategyIds.length && need>0;i++) {
            StrategyInfo storage s = strategies[strategyIds[i]];
            if (!s.enabled || vals[i]==0) continue;
            uint256 pull = (need * vals[i]) / totalStrat;
            if (pull == 0) continue;
            uint256 got = s.adapter.divest(pull);
            emit Divested(strategyIds[i], got);
            if (got >= need) break; else need -= got;
        }
    }

    function _sumAllocations() internal view returns (uint256 sum) {
        for (uint i=0;i<strategyIds.length;i++) sum += strategies[strategyIds[i]].allocationBps;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    receive() external payable {}
}


