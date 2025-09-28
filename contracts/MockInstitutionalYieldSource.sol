// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MockInstitutionalYieldSource is Ownable {
    mapping(address => uint256) public principal; // token => amount deposited

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount, address indexed to);
    event Accrued(address indexed token, uint256 amount);

    constructor(address _owner) Ownable(_owner) {}

    function deposit(address token, uint256 amount) external onlyOwner {
        // Owner is expected to be the bridge; tokens are already in bridge. Pull from owner.
        IERC20(token).transferFrom(owner(), address(this), amount);
        principal[token] += amount;
        emit Deposited(token, amount);
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).transfer(to, amount);
        emit Withdrawn(token, amount, to);
    }

    function totalAssets(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function accrueYield(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(owner(), address(this), amount);
        emit Accrued(token, amount);
    }
}


