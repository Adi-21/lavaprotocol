// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrategy {
    function vault() external view returns (address);
    function underlying() external view returns (address);
    function totalAssets() external view returns (uint256);
    function invest(uint256 amountWcBTC) external;
    function divest(uint256 amountWcBTC) external returns (uint256);
}


