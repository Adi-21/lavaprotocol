// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

interface IERC20 { function transferFrom(address,address,uint256) external returns(bool); function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); function balanceOf(address) external view returns(uint256); }
interface IBridge { function bridgeOut(address token, uint256 amount) external; function forwardToYieldSource(address token, uint256 amount) external; function pullFromYieldSource(address token, uint256 amount) external; function bridgeIn(address token, uint256 amount, address recipient) external; }
interface IYieldSourceView { function totalAssets(address token) external view returns (uint256); }

contract CrossChainAdapter is IStrategy, Ownable {
    address public immutable override vault;
    address public immutable override underlying; // WcBTC
    IERC20 public immutable usdc;
    IBridge public immutable bridge;
    IYieldSourceView public immutable ys;
    uint256 public investedBalance; // WcBTC held in custody (simulated)

    constructor(address _vault, address _underlying, address _usdc, address _bridge, address _ys) Ownable(_vault) {
        vault = _vault;
        underlying = _underlying;
        usdc = IERC20(_usdc);
        bridge = IBridge(_bridge);
        ys = IYieldSourceView(_ys);
    }

    function totalAssets() external view override returns (uint256) { return investedBalance; }

    function invest(uint256 amountWcBTC) external override {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return;
        // Vault already transferred WcBTC to this adapter; just account custody
        investedBalance += amountWcBTC;
    }

    function divest(uint256 amountWcBTC) external override returns (uint256 withdrawn) {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return 0;
        if (amountWcBTC > investedBalance) amountWcBTC = investedBalance;
        investedBalance -= amountWcBTC;
        IERC20(underlying).transfer(vault, amountWcBTC);
        return amountWcBTC;
    }
}


