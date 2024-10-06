<script>
    import { Packet } from "$lib/packet";
    import GoertzelNode from "goertzel-node";

    const SAMPLE_RATE = 48000;
    const SPACING = 40;
    const BASE_TONE = 440;
    const BAUD_RATE = 4;
    const NUM_TONES = 16;
    const BYTE_LENGTH = (0xff).toString(NUM_TONES).length;
    const SAMPLES_PER_SYMBOL = SAMPLE_RATE / BAUD_RATE;
    const SENSITIVITY = 1e-4;
    let transmitting = false;
    let receiving = false;
    let text = "";
    let receivedText = "";
    let buffer = [];

    function generateWaveform(msg) {
        // add preamble to message
        msg = [0xe6, 0x21, ...msg]
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
        packet.type = "init";
        packet.payload = 69;
        playMessage(packet.toBytes());
    }

    async function onReceiveFinish() {
        console.log(buffer);
        let uint8Buffer = new Uint8Array(Math.ceil(buffer.length / BYTE_LENGTH));
        let packetStart = -1;
        for (let i = 0; i < uint8Buffer.length; i++) {
            uint8Buffer[i] = parseInt(buffer.slice(i * BYTE_LENGTH, (i + 1) * BYTE_LENGTH).map(x => x.toString(NUM_TONES)).join(""), NUM_TONES);
            if (uint8Buffer[i] === 0x21 && uint8Buffer.length > 1 && uint8Buffer[i - 1] === 0xe6) {
                console.log("here!");
                packetStart = i - 1;
            }
        }
        if (packetStart !== -1 && (packetStart + 32) <= uint8Buffer.length) {
            buffer = [];
            let packet = new Packet();
            packet.fromBytes(uint8Buffer.slice(packetStart, packetStart + 32));
            console.log(packet);
        }
    }

    async function receive() {
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
            for (let i = 0; i < NUM_TONES; i++) {
                if (goertzels[i].detected) {
                    signalDetected = true;
                    if (goertzels[i].power > goertzels[firstGoertzel].power) firstGoertzel = i;
                }
            }
            if (signalDetected) {
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
                        if (goertzels[i].detected) {
                            detected = true;
                            if (goertzels[i].power > goertzels[max].power) {
                                max = i;
                            }
                        }
                    }
                    if (!detected) {
                        receivedText = buffer.map(x => x.toString(2).padStart(Math.log(NUM_TONES) / Math.log(2), "0")).join("");
                        console.log(receivedText);
                        console.log(Date.now() - startDecode);
                        clearInterval(bitInterval);
                        detectionInterval = setInterval(detect, 10);
                        receiving = false;
                        onReceiveFinish();
                    }
                    else buffer = [...buffer, max];
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