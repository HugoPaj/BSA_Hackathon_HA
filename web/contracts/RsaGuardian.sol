// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title RsaGuardian
/// @notice An EIP-1271 recovery guardian backed by the RSA signature key of a national ID card (Spanish DNIe:
/// "CertFirmaDigital", RSA-2048). The card signs the 32-byte recovery hash with SHA256withRSA (PKCS#1 v1.5), so this
/// contract accepts a signature when RSA(signature) == EMSA-PKCS1-v1_5(SHA-256(hash)). It holds no funds and can do
/// nothing but answer isValidSignature; the recovery module decides what a valid guardian signature allows.
/// @dev One instance per wallet (the CREATE2 salt includes the wallet), deployed in the wallet's first UserOperation.
/// Verification uses the MODEXP precompile (0x05) and the SHA-256 precompile (0x02).
contract RsaGuardian {
    bytes4 private constant MAGIC = 0x1626ba7e; // bytes4(keccak256("isValidSignature(bytes32,bytes)"))
    bytes4 private constant INVALID = 0xffffffff;
    // DER prefix of DigestInfo{ sha256, NULL } (RFC 8017, section 9.2, note 1).
    bytes19 private constant SHA256_DIGEST_INFO = 0x3031300d060960864801650304020105000420;

    bytes public modulus; // big-endian, no leading zero byte
    bytes public exponent; // big-endian
    address public immutable wallet; // the Safe this guardian protects (informational)

    constructor(address wallet_, bytes memory modulus_, bytes memory exponent_) {
        require(modulus_.length >= 256 && modulus_[0] != 0, "RsaGuardian: modulus must be >= 2048 bits");
        require(exponent_.length > 0 && exponent_.length <= 32, "RsaGuardian: bad exponent");
        wallet = wallet_;
        modulus = modulus_;
        exponent = exponent_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return verify(hash, signature) ? MAGIC : INVALID;
    }

    function verify(bytes32 hash, bytes calldata signature) public view returns (bool) {
        bytes memory n = modulus;
        uint256 k = n.length;
        if (signature.length != k) return false;

        // s^e mod n
        (bool ok, bytes memory em) = address(0x05).staticcall(abi.encodePacked(uint256(k), uint256(exponent.length), uint256(k), signature, exponent, n));
        if (!ok || em.length != k) return false;

        // Expected encoding: 0x00 0x01 FF..FF 0x00 || DigestInfo || SHA-256(hash)
        bytes32 digest = sha256(abi.encodePacked(hash));
        uint256 padEnd = k - 52; // 19-byte DigestInfo + 32-byte digest + the 0x00 separator
        if (em[0] != 0x00 || em[1] != 0x01 || em[padEnd] != 0x00) return false;
        for (uint256 i = 2; i < padEnd; i++) if (em[i] != 0xff) return false;
        bytes19 info;
        bytes32 got;
        assembly {
            let p := add(add(em, 32), add(padEnd, 1))
            info := mload(p)
            got := mload(add(p, 19))
        }
        return info == SHA256_DIGEST_INFO && got == digest;
    }
}
