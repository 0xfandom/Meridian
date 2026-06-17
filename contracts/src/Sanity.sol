// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title Sanity
/// @notice Scaffold sanity check proving that dependency remappings
///         (OpenZeppelin, Solady, forge-std) resolve and compile.
/// @dev Placeholder. Removed once the protocol contracts land.
library Sanity {
    /// @notice Returns the larger of two values via OpenZeppelin Math.
    function ozMax(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.max(a, b);
    }

    /// @notice Multiplies two WAD-scaled values via Solady FixedPointMathLib.
    function soladyMulWad(uint256 a, uint256 b) internal pure returns (uint256) {
        return FixedPointMathLib.mulWad(a, b);
    }
}
