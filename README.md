# CARF Redux
Like Cards Against Radio Frequency, but better! Uses the family pack of Cards Against Humanity to be FCC-friendly.

CARF Redux will have the following features:
- A built-in continuous-phase FSK modem, so no external software is necessary!
- Browser-based interface, for even more convenience than the original CARF.

## Protocol Documentation and Disclaimers
CARF Redux currently uses continuous-phase frequency shift keying with 16 frequencies, starting at 440Hz and with spacing between frequencies of 80Hz. The current symbol rate is 5 baud.

Each packet is 16 bytes, and consists of the following information:
- Preamble: 0xe621 (used to detect the start of a packet)
- Message type: 3 bits (0 is initialize game, 1 is join game, 2 is start game, 3 is place card, 4 is choose player, 5 is end game, and 6 & 7 are invalid)
- Payload: 9 bits, corresponds to the index of a card if message type is place, corresponds to the index of a user in the game if message type is choose.
- Callsign: 36 bits. A character in a callsign is 6 bits long, and possible values for each character range from 0 to 36. 0-25 correspond to A-Z, 26-35 corresopnd to 0-9, and 36 is a slash. The callsign will be stored in the first n*6 bits, where n is the number of characters in the callsign. The rest of the characters in the callsign will be set to 0b111111.
- Reed-Solomon Error Correction Code: 64 bits. Encoded using the Galois field for Aztec barcodes with a library from Zxing. For more info, see [here](https://github.com/cho45/reedsolomon.js/).

Combined with the source code, this should be all of the info needed to decode any transmissions from this program. The recommended ITU emissions designation for this program's output is 1K20J2D.

**The FSK modem in this program may therefore be used on any VHF, UHF, SHF, and EHF ham bands.** I cannot speak to its legality on the HF bands, as Sec. 97.309(a)(4) only allows for open protocols that use Baudot codes, AMTOR codes, or ASCII. CARF Redux does not use any of these.

**Do NOT use this program on any HF (or below) ham bands without first asking the FCC or verifying the legality of its use with a qualified legal professional.** Additionally, this section is **NOT** a substitute for legal advice; if you are concerned with the legality of any transmissions from this program, please consult an attorney. The ARRL seems to suggest that HF bands [such as 60m](https://www.arrl.org/60m-channel-allocation) may allow any J2D emission below 2.8 KHz. However, I have no clue.