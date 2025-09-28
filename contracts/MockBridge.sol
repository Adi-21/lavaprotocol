// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IYieldSource {
    function deposit(address token, uint256 amount) external;
    function withdraw(address token, uint256 amount, address to) external;
    function totalAssets(address token) external view returns (uint256);
}

contract MockBridge is Ownable {
    address public yieldSource;

    event BridgedOut(address indexed token, uint256 amount);
    event BridgedIn(address indexed token, uint256 amount, address indexed recipient);
    event YieldSourceSet(address indexed yieldSource);

    constructor(address _owner) Ownable(_owner) {}

    function setYieldSource(address _yieldSource) external onlyOwner {
        yieldSource = _yieldSource;
        emit YieldSourceSet(_yieldSource);
    }

    function bridgeOut(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit BridgedOut(token, amount);
    }

    function forwardToYieldSource(address token, uint256 amount) external onlyOwner {
        require(yieldSource != address(0), "yieldSource not set");
        IERC20(token).approve(yieldSource, amount);
        IYieldSource(yieldSource).deposit(token, amount);
    }

    function pullFromYieldSource(address token, uint256 amount) external onlyOwner {
        require(yieldSource != address(0), "yieldSource not set");
        IYieldSource(yieldSource).withdraw(token, amount, address(this));
    }

    function bridgeIn(address token, uint256 amount, address recipient) external onlyOwner {
        IERC20(token).transfer(recipient, amount);
        emit BridgedIn(token, amount, recipient);
    }

    function bridgedBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}


