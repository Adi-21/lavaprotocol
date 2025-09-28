// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

interface IERC20 { function transferFrom(address,address,uint256) external returns(bool); function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); function balanceOf(address) external view returns(uint256); }
interface ISatsumaLPVault { function deposit(uint256 amount, address receiver) external returns(uint256); function withdraw(uint256 amount, address receiver, address owner) external returns(uint256); function totalAssets() external view returns(uint256); }

contract SatsumaAdapter is IStrategy, Ownable {
    address public immutable override vault;
    address public immutable override underlying; // WcBTC
    ISatsumaLPVault public immutable lpVault;
    uint256 public investedBalance;

    constructor(address _vault, address _underlying, address _lpVault) Ownable(_vault) {
        vault = _vault;
        underlying = _underlying;
        lpVault = ISatsumaLPVault(_lpVault);
        IERC20(_underlying).approve(_lpVault, type(uint256).max);
    }

    function totalAssets() external view override returns (uint256) { return investedBalance; }

    function invest(uint256 amountWcBTC) external override {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return;
        // Tokens are already transferred from the vault to this adapter
        lpVault.deposit(amountWcBTC, address(this));
        investedBalance += amountWcBTC;
    }

    function divest(uint256 amountWcBTC) external override returns (uint256 withdrawn) {
        require(msg.sender == vault, "only vault");
        if (amountWcBTC == 0) return 0;
        withdrawn = lpVault.withdraw(amountWcBTC, address(this), address(this));
        if (withdrawn > 0) IERC20(underlying).transfer(vault, withdrawn);
        if (withdrawn > investedBalance) investedBalance = 0; else investedBalance -= withdrawn;
    }
}


