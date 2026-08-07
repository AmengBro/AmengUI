#ifndef AMSYS_SHA1_H
#define AMSYS_SHA1_H

// Header-only SHA-1 implementation (FIPS 180-1), no third-party dependencies.
// Used by the login launcher to verify {SHA1}-prefixed /etc/shadow hashes.

#include <string>
#include <cstdint>
#include <vector>

namespace amsys {

inline std::string sha1_hex(const std::string& data) {
    // ── Padding ──────────────────────────────────────
    uint64_t bit_len = (uint64_t)data.size() * 8;
    std::vector<uint8_t> msg(data.begin(), data.end());
    msg.push_back(0x80);
    while (msg.size() % 64 != 56) msg.push_back(0x00);
    for (int i = 7; i >= 0; i--) msg.push_back((uint8_t)(bit_len >> (8 * i))); // big-endian length

    // ── Initial state ────────────────────────────────
    uint32_t h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

    // ── Process blocks ───────────────────────────────
    for (size_t off = 0; off < msg.size(); off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++)
            w[i] = ((uint32_t)msg[off + i * 4] << 24) | ((uint32_t)msg[off + i * 4 + 1] << 16) |
                   ((uint32_t)msg[off + i * 4 + 2] << 8) | (uint32_t)msg[off + i * 4 + 3];
        for (int i = 16; i < 80; i++) {
            uint32_t t = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (t << 1) | (t >> 31);
        }

        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20)      { f = (b & c) | (~b & d);         k = 0x5a827999; }
            else if (i < 40) { f = b ^ c ^ d;                  k = 0x6ed9eba1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
            else             { f = b ^ c ^ d;                  k = 0xca62c1d6; }
            uint32_t temp = ((a << 5) | (a >> 27)) + f + e + k + w[i];
            e = d; d = c;
            c = (b << 30) | (b >> 2);
            b = a; a = temp;
        }
        h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;
    }

    // ── Output (big-endian hex) ──────────────────────
    static const char* HEX = "0123456789abcdef";
    uint32_t out[5] = {h0, h1, h2, h3, h4};
    std::string r;
    r.reserve(40);
    for (int i = 0; i < 5; i++)
        for (int b = 3; b >= 0; b--) {
            uint8_t byte = (uint8_t)(out[i] >> (8 * b));
            r += HEX[byte >> 4];
            r += HEX[byte & 0x0f];
        }
    return r;
}

// Self-test against FIPS 180-1 test vectors; returns false on mismatch.
inline bool sha1_self_test() {
    if (sha1_hex("") != "da39a3ee5e6b4b0d3255bfef95601890afd80709") return false;
    if (sha1_hex("abc") != "a9993e364706816aba3e25717850c26c9cd0d89d") return false;
    if (sha1_hex("The quick brown fox jumps over the lazy dog") !=
        "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12") return false;
    return true;
}

} // namespace amsys

#endif // AMSYS_SHA1_H
