<script>
    import { Packet } from "$lib/packet";
    import GoertzelNode from "goertzel-node";

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
    let transmitting = false;
    let receiving = false;
    let text = "";
    let receivedText = "";
    let buffer = [];

    function generateWaveform(msg) {
        // add preamble to message
        msg = [0xe6, 0x21, ...msg];
        // turn message into bit string
        msg = msg.map(x => x.toString(NUM_TONES).padStart(BYTE_LENGTH, "0").split("").map(x => parseInt(x, NUM_TONES))).reduce((prev, cur) => [...prev, ...cur], []);
        console.log(msg);
        // create a new array for the waveform
        let x = new Array(Math.floor(msg.length / BAUD_RATE) * 44100);
        // just fill it with on/off tone
        for (let i = 0; i < msg.length; i++) {
            for (let j = 0; j < SAMPLES_PER_SYMBOL; j++) {
                x[i * SAMPLES_PER_SYMBOL + j] = BASE_TONE + msg[i] * SPACING;
            }
        }
        // weird math bullshit i don't understand
        x = x.map(x => (x * Math.PI) / (SAMPLE_RATE / 2)).map((sum => value => sum += value)(0)).map(x => x % (Math.PI * 2)).map(x => Math.sin(x));
        // turn it into a float32array and enjoy
        x = Float32Array.from(x);
        console.log(x.length);
        return x;
    }

    async function playMessage(msg) {
        const waveform = generateWaveform(msg);
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
        playMessage(packet.toBytes());
    }

    async function onReceiveFinish() {
        let indexOfHeader = buffer.map(x => x.toString(NUM_TONES)).join("").indexOf((0xe621).toString(NUM_TONES));
        console.log(indexOfHeader);
        console.log(buffer);
        if (indexOfHeader !== -1 && indexOfHeader + (BYTE_LENGTH * 16) <= buffer.length + 1) {
            console.log("here");
            let uint8Buffer = new Uint8Array(14);
            for (let i = 0; i < uint8Buffer.length; i++) {
                uint8Buffer[i] = parseInt(buffer.slice(indexOfHeader + BYTE_LENGTH * 2 + i * BYTE_LENGTH, indexOfHeader + BYTE_LENGTH * 2 + (i + 1) * BYTE_LENGTH).map(x => x.toString(NUM_TONES)).join(""), NUM_TONES);
            }
            buffer = [];
            window.packetBuffer = uint8Buffer;
            console.log(uint8Buffer);
            let packet = new Packet();
            packet.fromBytes(uint8Buffer);
            console.log(packet);
        }
    }

    async function receive() {
        window.Packet = Packet;
        const audioContext = new AudioContext();
        console.log(audioContext.sampleRate);
        const stream = await navigator.mediaDevices.getUserMedia({ audio : true });
        const source = audioContext.createMediaStreamSource(stream);
        const filter = audioContext.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = Math.sqrt(BASE_TONE * ((NUM_TONES - 1) * 16 + BASE_TONE));
        filter.Q.value = Math.sqrt(BASE_TONE * ((NUM_TONES - 1) * 16 + BASE_TONE)) / (((NUM_TONES - 1) * 16 + BASE_TONE) - BASE_TONE);
        source.connect(filter);

        let goertzels = [];
        for (let i = 0; i < NUM_TONES; i++) {
            goertzels.push(new GoertzelNode(audioContext));
            goertzels[i].targetFrequency = BASE_TONE + i * SPACING;
            goertzels[i].threshold = SENSITIVITY;
            filter.connect(goertzels[i]);
        }

        let startDecode;
        let detectionInterval;
        let detect;

        detect = () => {
            //console.log(goertzelSpace.power);
            if (receiving) return;
            let signalDetected = false;
            let firstGoertzel = 0;
            let symbolCount = 0;
            let bufferStart = buffer.length;
            for (let i = 0; i < NUM_TONES; i++) {
                if (goertzels[i].detected) {
                    signalDetected = true;
                    if (goertzels[i].power > goertzels[firstGoertzel].power) firstGoertzel = i;
                }
            }
            if (signalDetected && firstGoertzel === parseInt((0xe).toString(NUM_TONES)[0], NUM_TONES)) {
                console.log(goertzels[firstGoertzel].power)
                receiving = true;
                clearInterval(detectionInterval);
                if (!startDecode) startDecode = Date.now();
                console.log("receiving");
                console.log(1000 / BAUD_RATE);
                buffer = [...buffer, firstGoertzel];
                let bitInterval = setInterval(() => {
                    console.log(Date.now() - startDecode);
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
                    if (!detected || symbolCount > 64 || (symbolCount === BYTE_LENGTH + 1 && parseInt(buffer.slice(bufferStart).map(x => x.toString(NUM_TONES)).join(""), NUM_TONES) !== 0xe621)) {
                        receivedText = buffer.map(x => x.toString(2).padStart(Math.log(NUM_TONES) / Math.log(2), "0")).join("");
                        console.log(receivedText);
                        console.log(Date.now() - startDecode);
                        clearInterval(bitInterval);
                        detectionInterval = setInterval(detect, 10);
                        receiving = false;
                        onReceiveFinish();
                    }
                    else {
                        buffer = [...buffer, max];
                        symbolCount++;
                    }
                }, 1000 / BAUD_RATE);
            }
        }

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