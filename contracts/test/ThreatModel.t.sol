// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Validates that security/threat-model.json is well-formed: the custody model is
///         non-custodial, every threat carries a STRIDE category, a known severity, a
///         non-empty mitigation, and references an audit gate that actually exists.
///         Keeps the threat model a living, checkable artifact rather than stale prose.
contract ThreatModelTest is Test {
    using stdJson for string;

    string internal json;

    function setUp() public {
        json = vm.readFile("security/threat-model.json");
    }

    function test_CustodyModelIsNonCustodial() public view {
        assertEq(json.readString(".custodyModel.type"), "non-custodial");
        assertGt(bytes(json.readString(".custodyModel.statement")).length, 0, "empty custody statement");
        assertGt(json.readStringArray(".custodyModel.privilegedRoles").length, 0, "no privileged roles listed");
    }

    function test_TrustBoundariesPresent() public view {
        assertGt(vm.parseJsonKeys(json, ".trustBoundaries").length, 0, "no trust boundaries");
    }

    function test_AuditGatesPresent() public view {
        string[] memory gates = vm.parseJsonKeys(json, ".auditGates");
        assertGt(gates.length, 0, "no audit gates");
        for (uint256 i = 0; i < gates.length; i++) {
            string memory base = string.concat(".auditGates.", gates[i]);
            assertGt(bytes(json.readString(string.concat(base, ".scope"))).length, 0, "empty gate scope");
            assertGt(bytes(json.readString(string.concat(base, ".trigger"))).length, 0, "empty gate trigger");
        }
    }

    function test_EveryThreatIsWellFormed() public view {
        string[] memory stride = _strideCategories();
        string[] memory severities = _severityLevels();
        string[] memory gates = vm.parseJsonKeys(json, ".auditGates");

        string[] memory ids = vm.parseJsonKeys(json, ".threats");
        assertGt(ids.length, 0, "no threats catalogued");

        for (uint256 i = 0; i < ids.length; i++) {
            string memory base = string.concat(".threats.", ids[i]);

            assertTrue(_isOneOf(json.readString(string.concat(base, ".category")), stride), "invalid STRIDE category");
            assertTrue(_isOneOf(json.readString(string.concat(base, ".severity")), severities), "invalid severity");
            assertGt(bytes(json.readString(string.concat(base, ".title"))).length, 0, "empty threat title");
            assertGt(bytes(json.readString(string.concat(base, ".asset"))).length, 0, "empty threat asset");
            assertGt(bytes(json.readString(string.concat(base, ".mitigation"))).length, 0, "empty mitigation");
            assertTrue(
                _isOneOf(json.readString(string.concat(base, ".auditGate")), gates), "threat references unknown gate"
            );
        }
    }

    function _strideCategories() internal pure returns (string[] memory s) {
        s = new string[](6);
        s[0] = "Spoofing";
        s[1] = "Tampering";
        s[2] = "Repudiation";
        s[3] = "InformationDisclosure";
        s[4] = "DenialOfService";
        s[5] = "ElevationOfPrivilege";
    }

    function _severityLevels() internal pure returns (string[] memory s) {
        s = new string[](4);
        s[0] = "critical";
        s[1] = "high";
        s[2] = "medium";
        s[3] = "low";
    }

    function _isOneOf(string memory value, string[] memory set) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(value));
        for (uint256 i = 0; i < set.length; i++) {
            if (keccak256(bytes(set[i])) == h) {
                return true;
            }
        }
        return false;
    }
}
