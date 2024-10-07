<script>
    import { Packet } from "$lib/packet";
    import GoertzelNode from "goertzel-node";

    // consts
    const SAMPLE_RATE = 48000;
    const SPACING = 80;
    const BASE_TONE = 440;
    const BAUD_RATE = 5;
    const NUM_TONES = 16;
    const PACKET_SIZE = 16;
    const BYTE_LENGTH = (0xff).toString(NUM_TONES).length;
    const SAMPLES_PER_SYMBOL = SAMPLE_RATE / BAUD_RATE;
    const SENSITIVITY = 1e-4;
    const SENSITIVITY_AFTER_START_RX = 1e-6;

    // global variables
    let transmitting = false;
    let receiving = false;
    let text = "";
    let receivedText = "";
    let buffer = [];

    // morse functions to comply with part 97
    const MORSE_ALPHABET = {
        "A": ".-",
        "B": "-...",
        "C": "-.-.",
        "D": "-..",
        "E": ".",
        "F": "..-.",
        "G": "--.",
        "H": "....",
        "I": "..",
        "J": ".---",
        "K": "-.-",
        "L": ".-..",
        "M": "--",
        "N": "-.",
        "O": "---",
        "P": ".--.",
        "Q": "--.-",
        "R": ".-.",
        "S": "...",
        "T": "-",
        "U": "..-",
        "V": "...-",
        "W": ".--",
        "X": "-..-",
        "Y": "-.- -",
        "Z": "--..",
        "1": ".----",
        "2": "..---",
        "3": "...--",
        "4": "....-",
        "5": ".....",
        "6": "-....",
        "7": "--...",
        "8": "---..",
        "9": "----.",
        "0": "-----"
    };
    const MORSE_UNIT = SAMPLE_RATE / 10;

    // function that generates morse for a callsign
    function generateMorse(callsign) {
        let array = [];
        for (let i = 0; i < MORSE_UNIT * 4; i++) array.push(0);
        for (let letter of callsign) {
            for (let i = 0; i < MORSE_UNIT * 2; i++) array.push(0);
            for (let unit of MORSE_ALPHABET[letter]) {
                for (let i = 0; i < MORSE_UNIT; i++) array.push(0);
                for (let i = 0; i < MORSE_UNIT * (unit === "." ? 1 : 3); i++) {
                    array.push(Math.sin(i / ((SAMPLE_RATE / (BASE_TONE + (SPACING / 2))) / (Math.PI * 2))));
                }
            }
        }
        return array;
    }

    // function to generate waveforms from packet bytes
    function generateWaveform(msg, callsign) {
        // add preamble to message
        msg = [0xe6, 0x21, ...msg];
        // turn message into bit string
        msg = msg.map(x => x.toString(NUM_TONES).padStart(BYTE_LENGTH, "0").split("").map(x => parseInt(x, NUM_TONES))).reduce((prev, cur) => [...prev, ...cur], []);
        console.log(msg);
        // create a new array for the waveform
        let x = new Array(Math.floor(msg.length / BAUD_RATE) * SAMPLE_RATE);
        // just fill it with on/off tone
        for (let i = 0; i < msg.length; i++) {
            for (let j = 0; j < SAMPLES_PER_SYMBOL; j++) {
                x[i * SAMPLES_PER_SYMBOL + j] = BASE_TONE + msg[i] * SPACING;
            }
        }
        // weird math bullshit i don't understand
        x = x.map(x => (x * Math.PI) / (SAMPLE_RATE / 2)).map((sum => value => sum += value)(0)).map(x => x % (Math.PI * 2)).map(x => Math.sin(x));
        // push morse of our callsign to the array
        x.push(...generateMorse(callsign));
        // turn it into a float32array and enjoy
        x = Float32Array.from(x);
        console.log(x.length);
        return x;
    }

    // function to play bytes to the speaker
    async function playMessage(msg, callsign) {
        // generate the waveform
        const waveform = generateWaveform(msg, callsign);
        // create an audio context, copy waveform to the buffer, channel, whatever, just play it and shit
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        const audioBuffer = audioContext.createBuffer(1, waveform.length, SAMPLE_RATE);
        audioBuffer.copyToChannel(waveform, 0);
        const source = audioContext.createBufferSource();
        source.connect(audioContext.destination);
        source.buffer = audioBuffer;
        source.start();
    }

    async function play() {
        let packet = new Packet();
        packet.callsign = "W5FUR";
        packet.type = "place";
        packet.payload = 69;
        playMessage(packet.toBytes(), "W5FUR");
    }

    // function that triggers when we get a packet
    async function onPacketReceive() {

    }

    // function that triggers when the receiver thinks it's finished
    async function onReceiveFinish() {
        // get the index of the start of the header
        let indexOfHeader = buffer.map(x => x.toString(NUM_TONES)).join("").indexOf((0xe621).toString(NUM_TONES));
        console.log(indexOfHeader);
        console.log(buffer);
        // if we have a header and the full packet is present (or missing a digit since we can fix that easily)
        if (indexOfHeader !== -1 && indexOfHeader + (BYTE_LENGTH * PACKET_SIZE) <= buffer.length + 1) {
            console.log("here");
            // make a uint8buffer for the packet and copy the packet into it
            let uint8Buffer = new Uint8Array(14);
            for (let i = 0; i < uint8Buffer.length; i++) {
                uint8Buffer[i] = parseInt(buffer.slice(indexOfHeader + BYTE_LENGTH * 2 + i * BYTE_LENGTH, indexOfHeader + BYTE_LENGTH * 2 + (i + 1) * BYTE_LENGTH).map(x => x.toString(NUM_TONES)).join(""), NUM_TONES);
            }
            // erset the buffer
            buffer = [];
            console.log(uint8Buffer);
            // decode the packet
            let packet = new Packet();
            packet.fromBytes(uint8Buffer);
            console.log(packet);
            onPacketReceive(packet);
        }
    }

    // function that turns on the receiver
    async function receive() {
        window.Packet = Packet;
        // create an audio context, log the sample rate
        const audioContext = new AudioContext();
        console.log(audioContext.sampleRate);
        // get the mic output
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, autoGainControl: true });
        const source = audioContext.createMediaStreamSource(stream);
        // create a bandpass filter to only pass our desired frequqencies through
        const filter = audioContext.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = Math.sqrt(BASE_TONE * ((NUM_TONES - 1) * SPACING + BASE_TONE));
        filter.Q.value = Math.sqrt(BASE_TONE * ((NUM_TONES - 1) * SPACING + BASE_TONE)) / (((NUM_TONES - 1) * SPACING + BASE_TONE) - BASE_TONE);
        source.connect(filter);
        // hook goertzels to the output of the filter
        let goertzels = [];
        for (let i = 0; i < NUM_TONES; i++) {
            goertzels.push(new GoertzelNode(audioContext));
            goertzels[i].targetFrequency = BASE_TONE + i * SPACING;
            goertzels[i].threshold = SENSITIVITY;
            filter.connect(goertzels[i]);
        }
        // variables
        let detectionInterval;
        let detect;
        // loop to detect our signal
        detect = () => {
            //console.log(goertzelSpace.power);
            // if we're receiving, return; shouldn't be triggered but just in case
            if (receiving) return;
            // variables
            let signalDetected = false;
            let firstGoertzel = 0;
            let symbolCount = 0;
            let bufferStart = buffer.length;
            // check for our tone with goertzel
            for (let i = 0; i < NUM_TONES; i++) {
                if (goertzels[i].detected) {
                    signalDetected = true;
                    if (goertzels[i].power > goertzels[firstGoertzel].power) firstGoertzel = i;
                }
            }
            // if we have a signal and it looks right
            if (signalDetected && firstGoertzel === parseInt((0xe).toString(NUM_TONES)[0], NUM_TONES)) {
                console.log(goertzels[firstGoertzel].power)
                // set recv and clear the detect interval
                receiving = true;
                clearInterval(detectionInterval);
                console.log("receiving");
                console.log(1000 / BAUD_RATE);
                // add the first symbol to the buffer
                buffer = [...buffer, firstGoertzel];
                // create an interval to get each symbol
                let symbolInterval = setInterval(() => {
                    // find the strongest frequency
                    let detected = false;
                    let max = 0;
                    for (let i = 0; i < NUM_TONES; i++) {
                        if (goertzels[i].power > SENSITIVITY_AFTER_START_RX) {
                            detected = true;
                            if (goertzels[i].power > goertzels[max].power) {
                                max = i;
                            }
                        }
                    }
                    // if we don't have a freq or if our safeguards activate
                    if (!detected || symbolCount > 64 || (symbolCount === BYTE_LENGTH + 1 && parseInt(buffer.slice(bufferStart).map(x => x.toString(NUM_TONES)).join(""), NUM_TONES) !== 0xe621)) {
                        // clear the symbol interval
                        clearInterval(symbolInterval);
                        // set the detect interval again
                        detectionInterval = setInterval(detect, 10);
                        // set receiving to false
                        receiving = false;
                        // trigger onreceivefinish
                        onReceiveFinish();
                    }
                    // if we do have a symbol, just add it to the buffer and increase symbol count
                    else {
                        buffer = [...buffer, max];
                        symbolCount++;
                    }
                }, 1000 / BAUD_RATE);
            }
        }
        // set the detection interval
        detectionInterval = setInterval(detect, 10);
    }

</script>

<button on:click={play}>
    play audio
</button>

<button on:click={receive}>
    start input
</button>

<p>
received: {receivedText}
</p>
<p>
sent: {text}
</p>