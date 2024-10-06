// just turns our card json file into nice arrays
import cards from "$lib/cards.json";

export let whiteMap = [];
for (let card of cards.white) whiteMap.push(card.text);

export let blackMap = [];
for (let card of cards.black) blackMap.push(card.text);