/**
 * MIT LICENSE
 * 
 * Copyright 2023 belladore.ai
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * 
 */

const llamaTokenizer = {} as any;

if (typeof window !== 'undefined') {
    (window as any).llamaTokenizer = llamaTokenizer
}

const base64decode = function(encodedString) {
    return atob(encodedString)
}

const getMergeIdentifierString = function(firstTokenId, secondTokenId) {
    return llamaTokenizer.vocabById[firstTokenId] + " " + llamaTokenizer.vocabById[secondTokenId]
}

const decompressMerges = function(merges_binary) {
    // Base64 decode binary.
    const byteArrayString = base64decode(merges_binary)

    // Convert byteArrayString to byteArray.
    const byteArray = new Uint8Array(byteArrayString.length);
    for (let i = 0; i < byteArrayString.length; i++) {
        byteArray[i] = byteArrayString.charCodeAt(i);
    }

    // Each byte-pair represents a tokenId.
    // Convert byte-pairs to tokenIds (integers between 0 and 32000).
    const tokenIds = [];
    for (let i = 0; i < byteArray.length; i += 2) {
        const byte1 = byteArray[i];
        const byte2 = byteArray[i + 1];
        const tokenId = byte1 + (byte2 << 8);
        tokenIds.push(tokenId);
    }

    // Each pair of tokenIds represents a merge.
    const merges = new Map()
    for (let i=0; i<tokenIds.length; i+=2) {
        const id1 = tokenIds[i]
        const id2 = tokenIds[i+1]
        const mergeIdentifierString = getMergeIdentifierString(id1, id2)
        // Key identifies token pair, value represents merge priority
        merges.set(mergeIdentifierString, i+1)
    }
    return merges
}


/**
 * Helper function to decode the vocabulary.
 * 
 * vocab_base64 is base64-encoded string of tokens delimited by '\n' (line break) in utf-8.
 * The row number of the token (indexing from 0) represents the id of the token in LLaMA tokenizer.
 * 
 * Most tokens look like this: "ic" (without the quotes) (representing the "i" character followed by the "c" character)
 * Some tokens are special. In particular, spaces are replaced with the "▁" character and line-break is represented as "<0x0A>".
 * 
 * This helper function returns the vocabulary as an array that contains Strings representing tokens:
 * 
 *  "<unk>"   // Special token: unknown token
 *  "<s>"     // Special token: beginning of string 
 *  "</s>"    // Special token: end of string
 *  "<0x00>"  // Byte-level token representing the 0-byte
 *  "<0x01>"  // Byte-level token ...
 *  "<0x02>"  // Byte-level token ...
 *  ...       // More byte-level tokens
 *  "<0x0A>"  // Byte-level token representing '\n' (line break). This is one of the few byte-level tokens that appear to be actually needed in practice.
 *  ...       // More byte-level tokens
 *  "<0xFF>"  // Byte-level token ...
 *  "▁▁"     // Token representing 2 consecutive spaces.
 *  "▁t"     // Token representing the space character followed by the "t" character.
 *  "er"      // Token representing the "e" character followed by the "r" character. Most tokens look like this.
 *  ...       // 32000 tokens
 */
const decodeVocabulary = function(vocab_base64) {
    const byteArray = Uint8Array.from(base64decode(vocab_base64), c => c.charCodeAt(0));
    const textDecoder = new TextDecoder('utf-8');
    return textDecoder.decode(byteArray).split("\n");
}

const utf8ByteToHex = (c) => {
    const hexValue = c.toString(16).toUpperCase().padStart(2, '0');
    return `<0x${hexValue}>`;
}

const hexToUtf8Byte = (hex) => {
    const strippedHex = hex.replace(/<0x|>/g, '')
    return parseInt(strippedHex, 16)
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8')

class PriorityQueue {
    // for ts
    _heap: any[]
    _comparator: any


    // PriorityQueue implementation is copied from https://stackoverflow.com/a/42919752 with minor refactoring
    constructor(comparator = (a, b) => a > b) {
        this._heap = [];
        this._comparator = comparator;
    }
    size() {
        return this._heap.length;
    }
    isEmpty() {
        return this.size() == 0;
    }
    peek() {
        return this._heap[0];
    }
    push(...values) {
        values.forEach(value => {
            this._heap.push(value);
            this._siftUp();
        });
        return this.size();
    }
    pop() {
        const poppedValue = this.peek();
        const bottom = this.size() - 1;
        if (bottom > 0) {
            this._swap(0, bottom);
        }
        this._heap.pop();
        this._siftDown();
        return poppedValue;
    }
    replace(value) {
        const replacedValue = this.peek();
        this._heap[0] = value;
        this._siftDown();
        return replacedValue;
    }
    _parent(i) {
        return ((i + 1) >>> 1) - 1;
    }
    _left(i) {
        return (i << 1) + 1;
    }
    _right(i) {
        return (i + 1) << 1;
    }
    _greater(i, j) {
        return this._comparator(this._heap[i], this._heap[j]);
    }
    _swap(i, j) {
        [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]];
    }
    _siftUp() {
        let node = this.size() - 1;
        while (node > 0 && this._greater(node, this._parent(node))) {
            this._swap(node, this._parent(node));
            node = this._parent(node);
        }
    }
    _siftDown() {
        let node = 0;
        while (
            (this._left(node) < this.size() && this._greater(this._left(node), node)) ||
            (this._right(node) < this.size() && this._greater(this._right(node), node))
        ) {
            let maxChild = (this._right(node) < this.size() && this._greater(this._right(node), this._left(node))) ? this._right(node) : this._left(node);
            this._swap(node, maxChild);
            node = maxChild;
        }
    }
}

const mapCharactersToTokenIds = (prompt, add_bos_token, add_preceding_space) => {
    const tokenIds = []
    // Special "beginning of string" token.
    if (add_bos_token) {
        tokenIds.push(1)
    }
    // Special "preceding space" added to beginning of prompt.
    if (add_preceding_space) {
        prompt = " " + prompt
    }
    // Special: spaces are represented as thick underscore ▁ (id 29871)
    const promptAltered = (prompt).replaceAll(" ", llamaTokenizer.vocabById[29871])
    // We need to use Array.from to iterate over characters in order to support UTF-8 multipoint characters
    const charArray = Array.from(promptAltered)
    // Transform each character to its corresponding token
    for (let i=0; i<charArray.length; i++) {
        const c = charArray[i] as string
        if (llamaTokenizer.vocabByString.has(c)) {
            // Typical case
            tokenIds.push(llamaTokenizer.vocabByString.get(c))
        } else {
            // Special case where token not found and we have to fallback to byte-level tokens.
            const bytes = utf8Encoder.encode(c)
            for (let j=0; j<bytes.length; j++) {
                const hex = llamaTokenizer.vocabByString.get(utf8ByteToHex(bytes[j]))
                tokenIds.push(hex)
                if (!(hex >= 0)) {
                    // This is not supposed to happen because the LLaMA vocabulary has a token corresponding to each byte,
                    // but if this happens regardless, let's follow the protocol and tokenize to <UNK> token instead of crashing.
                    console.log('Encountered unknown character ' + c + " (partial UTF-8 byte " + bytes[j] + " + hex + " + utf8ByteToHex(bytes[j]) + ")")
                    tokenIds[tokenIds.length-1] = 0
                }
            }
        }
    }
    return tokenIds
}

const encode = (prompt, add_bos_token=true, add_preceding_space=true, log_performance=false) => {

    let startTime = null
    if (log_performance) {
        startTime = performance.now()
    }

    if (!llamaTokenizer.vocabById || !llamaTokenizer.vocabByString || !llamaTokenizer.merges) {
        console.log('Tokenizer not initialized properly!')
        return
    }
    if (prompt.length === 0) {
        return []
    }
    // Initially each character is transformed to a tokenId, later there will be merges of these.
    const tokenIds = mapCharactersToTokenIds(prompt, add_bos_token, add_preceding_space)

    // Set up priority queue to efficiently iterate merge possibilities in priority order
    const mergeQueue = new PriorityQueue((a, b) => {
        return a.mergePrio < b.mergePrio
    })
    const addToMergeQueue = function(leftNode) {
        const mergeIdentifierString = getMergeIdentifierString(leftNode.tokenId, leftNode.next.tokenId)
        // Merge priority is primarily determined by the location of the merge in the "merges" data,
        // secondarily determined by the relative position of the node in the linked list
        // (We want to perform equal merges from left to right)
        const mergePrio = llamaTokenizer.merges.get(mergeIdentifierString) + leftNode.origPos / prompt.length
        if (mergePrio) {
            // If mergePrio not found in merges, that means this merge is not possible according to vocabulary.
            leftNode.mergePrio = mergePrio
            leftNode.mergeToString = mergeIdentifierString.replace(" ", "")
            mergeQueue.push(leftNode)
        }
    }

    // Fill merge queue from initial merge possibilities and construct linked list
    let firstTokenNode = {
        origPos: 0,
        tokenId: tokenIds[0],
        prev: null,
        next: null,
    }
    let prevTokenNode = firstTokenNode
    for (let i=1; i<tokenIds.length; i++) {
        const currTokenNode = {
            origPos: i,
            tokenId: tokenIds[i],
            prev: prevTokenNode,
            next: null
        }
        prevTokenNode.next = currTokenNode
        addToMergeQueue(prevTokenNode)
        prevTokenNode = currTokenNode
    }

    // Perform merges in priority order
    while (!mergeQueue.isEmpty()) {
        const leftOfMerge = mergeQueue.pop()
        // Check that this merge is still possible
        if (leftOfMerge.deleted) continue
        if (!leftOfMerge.next) continue
        if (leftOfMerge.next.deleted) continue
        
        // Mark leftOfMerge and rightOfMerge as being deleted, because they are actually being replaced by a merged token.
        leftOfMerge.deleted = true
        leftOfMerge.next.deleted = true
        // It's a little bit more complicated to fix the prev of leftOfMerge.
        if (leftOfMerge.prev) {
            const oldPrev = leftOfMerge.prev
            // Mark oldPrev as deleted, to avoid erroneous merges later (ref to this node might exist in priorityqueue)
            oldPrev.deleted = true
            // Replace oldPrev within the linked list with a copy of itself
            const newPrev = {
                origPos: oldPrev.origPos,
                tokenId: oldPrev.tokenId,
                prev: oldPrev.prev,
                next: oldPrev.next
            }
            leftOfMerge.prev = newPrev
            // Update linked list reference of "prev of prev"
            if (newPrev.prev) {
                newPrev.prev.next = newPrev
            } else {
                // If "prev of prev" does not exist, that means newPrev must be the new firstNode
                firstTokenNode = newPrev
            }
        }
        // Create node representing merge result
        const resultOfMerge = {
            origPos: leftOfMerge.origPos,
            tokenId: llamaTokenizer.vocabByString.get(leftOfMerge.mergeToString),
            prev: leftOfMerge.prev,
            next: leftOfMerge.next.next
        }
        // Consider adding to merge queue: prev--resultOfMerge
        if (resultOfMerge.prev) {
            resultOfMerge.prev.next = resultOfMerge
            resultOfMerge.prev
            addToMergeQueue(resultOfMerge.prev)
        } else {
            // If prev does not exist then this is the new firstNode
            firstTokenNode = resultOfMerge
        }
        // Consider adding to merge queue: resultOfMerge--next
        if (resultOfMerge.next) {
            resultOfMerge.next.prev = resultOfMerge
            addToMergeQueue(resultOfMerge)
        }

    }

    // Get final tokenIds by traversing the linked list
    const mergedTokenIds = []
    for (let currTokenNode = firstTokenNode; currTokenNode !== null; currTokenNode = currTokenNode.next) {
        mergedTokenIds.push(currTokenNode.tokenId)
    }

    if (log_performance) {
        const endTime = performance.now()
        console.log('Tokenizer running time: ' + (endTime - startTime) + " milliseconds")
    }

    return mergedTokenIds
}

const decode = function(tokenIds, add_bos_token=true, add_preceding_space=true) {
    const utf8byteVals = []
    const startIndex = add_bos_token ? 1 : 0
    for (let i=startIndex; i<tokenIds.length; i++) {
        const tokenId = tokenIds[i]
        const tokenString = llamaTokenizer.vocabById[tokenId]
        if (tokenString.startsWith("<0x") && tokenString.endsWith(">")) {
            // Special case
            const utf8byte = hexToUtf8Byte(tokenString)
            utf8byteVals.push(utf8byte)
        } else {
            // Typical case
            const utf8bytes = utf8Encoder.encode(tokenString)
            utf8bytes.forEach(utf8Byte => utf8byteVals.push(utf8Byte))
        }
    }
    const uint8Array = new Uint8Array(utf8byteVals)
    const decodedString = utf8Decoder.decode(uint8Array)
    const spacesFixed = decodedString.replaceAll(llamaTokenizer.vocabById[29871], " ")
    // Note that preceding space must be removed here at string level, not earlier at token level, because multiple consecutive spaces are represented as single token.
    return add_preceding_space ? spacesFixed.slice(1) : spacesFixed
}

function runTests() {

    function isEqual(arr1, arr2) {
        return arr1.length === arr2.length && arr1.every(function(value, index) { return value === arr2[index]})
    }

    function testCase(inputString, expectedTokenIds) {
        const actualTokens = encode(inputString, true, true, true)
        if (!isEqual(actualTokens, expectedTokenIds)) {
            throw `Test failed. LLaMA Tokenizer Encoder returned unexpected result: expected tokenize(${inputString}) === ${expectedTokenIds}, actual was: ${actualTokens}`
        }
        if (inputString !== decode(actualTokens)) {
            throw `Test failed. LLaMA Tokenizer Decoder returned unexpected result: expected decode(${actualTokens}) === ${inputString}, actual was: ${decode(actualTokens)}`
        }
    }
        
    // Simple test case
    testCase("grabbed",                           [1, 2646,   1327,   287])

    // Naive implementation produces inconsistent tokenization for " grabbed", making this a good test case
    testCase(" grabbed",                          [1, 29871,  2646,   1327,   287])

    // Naive implementation uses incorrect merge order for multiple consecutive space merges, making this a good test case
    testCase("           grabbed",                [1, 9651,   2646,   1327,   287])

    // Linebreaks and tabs are handled as fallback to byte tokens
    testCase("\n",                                [1, 29871,  13])
    testCase(" \n",                               [1, 259,    13])
    testCase("	tabs				out here",    [1, 29871,  12,     21175,  12,     12,     12,     12,     449,    1244])

    // Equal prio merges are performed left-to-right (fixed in 1.1.1)
    testCase("ax\n####\nboo",                     [1, 4853,   13,     4136,   13,     833,    29877])

    // UTF-8 multipoint character that should be found in vocabulary
    testCase('镇',                                [1, 29871,  30411])

    // UTF-8 multipoint character that should NOT be found in vocabulary, fallback to MULTIPLE byte tokens
    testCase('🦙',                               [1, 29871,  243,    162,    169,    156])

    // Consecutive UTF-8 multipoint characters that are NOT found in a vocabulary and use DIFFERENT number of bytes
    testCase('🦙Ꙋ',                              [1, 29871,  243,    162,    169,    156,    237,    156,    141])
    testCase('Ꙋ🦙',                              [1, 29871,  237,    156,    141,    243,    162,    169,    156])

    // Larger text input with various special characters sprinkled in
    testCase("The llama (/ˈlɑːmə/; 🦙Spanish pronunciation: [ˈʎama]) (Lama glama) is a domesticated South American camelid, widely used as a meat and pack animal by Andean cultures since the Pre-Columbian era. Llamas are social animals and live with others as a herd. Their wool is soft and contains only a small amount of lanolin.[2] Llamas can learn simple tasks after a few repetitions. When using a pack, they can carry about 25 to 30% of their body weight for 8 to 13 km (5–8 miles).[3] The name llama (in the past also spelled \"lama\" or \"glama\") was adopted by European settlers from native Peruvians.[4] The ancestors of llamas are thought to have originated from the Great Plains of North America about 40 million years ago, and subsequently migrated to South America about three million years ago during the Great American Interchange. By the end of the last ice age (10,000–12,000 years ago), camelids were extinct in North America.[3] As of 2007, there were over seven million llamas and alpacas in South America and over 158,000 llamas and 100,000Ꙋ🦙 alpacas, descended from progenitors imported late in the 20th century, in the United States and Canada.[5] In Aymara mythology, llamas are important beings. The Heavenly Llama is said to drink water from the ocean and urinates as it rains.[6] According to Aymara eschatology, llamas will return to the water springs and lagoons where they come from at the end of time.[6]",
    [1,   450, 11148,  3304, 20374, 30176, 29880, 30426, 30215, 29885,
        30184, 29914, 29936, 29871,   243,   162,   169,   156, 15495,   728,
        11504, 11173,   362, 29901,   518, 30176, 31743,  3304,  2314,   313,
        29931,  3304,  3144,  3304, 29897,   338,   263, 21849,   630,  4275,
        3082,  3949,   295,   333, 29892, 17644,  1304,   408,   263, 27654,
        322,  4870, 13019,   491,  1126, 29872,   273,  4185,  1973,  1951,
        278,  4721, 29899,  1625,  3774,   713,  3152, 29889,   365,  5288,
        294,   526,  5264, 15006,   322,  5735,   411,  4045,   408,   263,
        902, 29881, 29889, 11275,   281,  1507,   338,  4964,   322,  3743,
        871,   263,  2319,  5253,   310, 10906, 22878,  7226, 29906, 29962,
        365,  5288,   294,   508,  5110,  2560,  9595,  1156,   263,  2846,
        21159,  2187, 29889,  1932,   773,   263,  4870, 29892,   896,   508,
        8677,  1048, 29871, 29906, 29945,   304, 29871, 29941, 29900, 29995,
        310,  1009,  3573,  7688,   363, 29871, 29947,   304, 29871, 29896,
        29941,  2383,   313, 29945, 29994, 29947,  7800,   467, 29961, 29941,
        29962,   450,  1024, 11148,  3304,   313,   262,   278,  4940,   884,
        805, 14356,   376, 29880,  3304, 29908,   470,   376,  3820,  3304,
        1159,   471, 16356,   491,  7824,  3604,  9306,   515,  7531, 25493,
        1403,   550,  7226, 29946, 29962,   450, 19525,   943,   310, 11829,
        294,   526,  2714,   304,   505,  3978,   630,   515,   278,  7027,
        13494,  1144,   310,  4644,  6813,  1048, 29871, 29946, 29900,  7284,
        2440,  8020, 29892,   322, 17602,  9725,   630,   304,  4275,  6813,
        1048,  2211,  7284,  2440,  8020,  2645,   278,  7027,  3082,  4124,
        3167, 29889,  2648,   278,  1095,   310,   278,  1833, 14890,  5046,
        313, 29896, 29900, 29892, 29900, 29900, 29900, 29994, 29896, 29906,
        29892, 29900, 29900, 29900,  2440,  8020,   511,  3949,   295,  4841,
        892,  1294,  5562,   297,  4644,  6813,  7226, 29941, 29962,  1094,
        310, 29871, 29906, 29900, 29900, 29955, 29892,   727,   892,   975,
        9881,  7284, 11829,   294,   322,   394, 29886,   562,   294,   297,
        4275,  6813,   322,   975, 29871, 29896, 29945, 29947, 29892, 29900,
        29900, 29900, 11829,   294,   322, 29871, 29896, 29900, 29900, 29892,
        29900, 29900, 29900,   237,   156,   141,   243,   162,   169,   156,
        394, 29886,   562,   294, 29892,  5153,  2760,   515,   410,  1885,
        17259, 19673,  5683,   297,   278, 29871, 29906, 29900,   386,  6462,
        29892,   297,   278,  3303,  3900,   322,  7400,  7226, 29945, 29962,
        512,   319,   962,  2518, 22082,  3002, 29892, 11829,   294,   526,
        4100,   367,   886, 29889,   450, 22977,   368,   365, 29880,  3304,
        338,  1497,   304, 13748,  4094,   515,   278, 23474,   322,  5065,
        262,  1078,   408,   372,  1153,  1144,  7226, 29953, 29962,  7579,
        304,   319,   962,  2518,   831, 13496,  3002, 29892, 11829,   294,
        674,   736,   304,   278,  4094,  7689,   886,   322,   301,  4425,
        787,   988,   896,  2041,   515,   472,   278,  1095,   310,   931,
        7226, 29953, 29962])

    console.log('LLaMA Tokenizer tests passed successfully.')
    return true
}

function initializeLlamaTokenizer() {
    llamaTokenizer.encode = encode
    llamaTokenizer.decode = decode
    llamaTokenizer.runTests = runTests
    // Array where index represents tokenId, value represents tokenString
    llamaTokenizer.vocabById = decodeVocabulary(vocab_base64) 
    // Map where key represents tokenString, value represents tokenId
    llamaTokenizer.vocabByString = new Map();
    llamaTokenizer.vocabById.forEach((tokenString, tokenId) => {
        llamaTokenizer.vocabByString.set(tokenString, tokenId);
    });
    // Map where key identifies token pair, value represents merge priority
    llamaTokenizer.merges = decompressMerges(merges_binary)
}

const vocab_base64 = "PHVuaz4KPHM+Cjwvcz4KP<---Copy/paste this yourself because it's---->BuQrovrkK6L+YCum7gwrsmZUK5pS2CuW8mArnu5k="

const merges_binary = "r3SxdLB0tnSzdLR0r3<----Tooooo LOOOOOONGGGG---->vdMRJr3SvdA=="

initializeLlamaTokenizer()

export default llamaTokenizer