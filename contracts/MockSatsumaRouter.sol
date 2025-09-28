// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

// Not used in Strategy 6, but kept for completeness if needed.
contract MockSatsumaRouter {
    function exactInputSingle(bytes calldata) external pure returns (uint256) {
        return 0;
    }
}


