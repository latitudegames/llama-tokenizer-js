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

type SortNode = {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    origPos: any
    tokenId: number
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    prev?: SortNode | undefined
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    next: SortNode | undefined
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    mergePrio?: any
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    mergeToString?: any
  }
  
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const llamaTokenizer = {} as any
  
  if (typeof window !== 'undefined') {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ;(window as any).llamaTokenizer = llamaTokenizer
  }
  
  const base64decode = (encodedString: string) => atob(encodedString)
  
  const getMergeIdentifierString = (firstTokenId: number, secondTokenId: number) =>
    `${llamaTokenizer.vocabById[firstTokenId]} ${llamaTokenizer.vocabById[secondTokenId]}`
  
  const decompressMerges = (merges_binary: string) => {
    // Base64 decode binary.
    const byteArrayString = base64decode(merges_binary)
  
    // Convert byteArrayString to byteArray.
    const byteArray = new Uint8Array(byteArrayString.length)
    for (let i = 0; i < byteArrayString.length; i++) {
      byteArray[i] = byteArrayString.charCodeAt(i)
    }
  
    // Each byte-pair represents a tokenId.
    // Convert byte-pairs to tokenIds (integers between 0 and 32000).
    const tokenIds = []
    for (let i = 0; i < byteArray.length; i += 2) {
      const byte1 = byteArray[i]
      const byte2 = byteArray[i + 1]
      if (!byte1 || !byte2) continue
      const tokenId = byte1 + (byte2 << 8)
      tokenIds.push(tokenId)
    }
  
    // Each pair of tokenIds represents a merge.
    const merges = new Map()
    for (let i = 0; i < tokenIds.length; i += 2) {
      const id1 = tokenIds[i]
      const id2 = tokenIds[i + 1]
      if (!id1 || !id2) continue
      const mergeIdentifierString = getMergeIdentifierString(id1, id2)
      // Key identifies token pair, value represents merge priority
      merges.set(mergeIdentifierString, i + 1)
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
  const decodeVocabulary = (vocab_base64: string) => {
    const byteArray = Uint8Array.from(base64decode(vocab_base64), (c) => c.charCodeAt(0))
    const textDecoder = new TextDecoder('utf-8')
    return textDecoder.decode(byteArray).split('\n')
  }
  
  const utf8ByteToHex = (c: number) => {
    const hexValue = c.toString(16).toUpperCase().padStart(2, '0')
    return `<0x${hexValue}>`
  }
  
  const hexToUtf8Byte = (hex: string) => {
    const strippedHex = hex.replace(/<0x|>/g, '')
    return parseInt(strippedHex, 16)
  }
  
  const utf8Encoder = new TextEncoder()
  const utf8Decoder = new TextDecoder('utf-8')
  
  class PriorityQueue {
    // for ts
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    _heap: any[]
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    _comparator: any
  
    // PriorityQueue implementation is copied from https://stackoverflow.com/a/42919752 with minor refactoring
    constructor(comparator = (a: SortNode, b: SortNode) => a > b) {
      this._heap = []
      this._comparator = comparator
    }
    size() {
      return this._heap.length
    }
    isEmpty() {
      return this.size() === 0
    }
    peek() {
      return this._heap[0]
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    push(...values: any[]) {
      // biome-ignore lint/complexity/noForEach: <explanation>
      values.forEach((value) => {
        this._heap.push(value)
        this._siftUp()
      })
      return this.size()
    }
    pop() {
      const poppedValue = this.peek()
      const bottom = this.size() - 1
      if (bottom > 0) {
        this._swap(0, bottom)
      }
      this._heap.pop()
      this._siftDown()
      return poppedValue
    }
    replace(value: string) {
      const replacedValue = this.peek()
      this._heap[0] = value
      this._siftDown()
      return replacedValue
    }
    _parent(i: number) {
      return ((i + 1) >>> 1) - 1
    }
    _left(i: number) {
      return (i << 1) + 1
    }
    _right(i: number) {
      return (i + 1) << 1
    }
    _greater(i: number, j: number) {
      return this._comparator(this._heap[i], this._heap[j])
    }
    _swap(i: number, j: number) {
      ;[this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]]
    }
    _siftUp() {
      let node = this.size() - 1
      while (node > 0 && this._greater(node, this._parent(node))) {
        this._swap(node, this._parent(node))
        node = this._parent(node)
      }
    }
    _siftDown() {
      let node = 0
      while (
        (this._left(node) < this.size() && this._greater(this._left(node), node)) ||
        (this._right(node) < this.size() && this._greater(this._right(node), node))
      ) {
        const maxChild =
          this._right(node) < this.size() && this._greater(this._right(node), this._left(node))
            ? this._right(node)
            : this._left(node)
        this._swap(node, maxChild)
        node = maxChild
      }
    }
  }
  
  const mapCharactersToTokenIds = (
    prompt: string,
    add_bos_token: boolean,
    add_preceding_space: boolean,
  ) => {
    let modifiedPromptParameter = prompt
    const tokenIds = []
    // Special "beginning of string" token.
    if (add_bos_token) {
      tokenIds.push(1)
    }
    // Special "preceding space" added to beginning of prompt.
    if (add_preceding_space) {
      modifiedPromptParameter = ` ${prompt}`
    }
    // Special: spaces are represented as thick underscore ▁ (id 29871)
    const promptAltered = modifiedPromptParameter.replaceAll(' ', llamaTokenizer.vocabById[29871])
    // We need to use Array.from to iterate over characters in order to support UTF-8 multipoint characters
    const charArray = Array.from(promptAltered)
    // Transform each character to its corresponding token
    for (let i = 0; i < charArray.length; i++) {
      const c = charArray[i] as string
      if (llamaTokenizer.vocabByString.has(c)) {
        // Typical case
        tokenIds.push(llamaTokenizer.vocabByString.get(c) as number)
      } else {
        // Special case where token not found and we have to fallback to byte-level tokens.
        const bytes = utf8Encoder.encode(c)
        for (let j = 0; j < bytes.length; j++) {
          if (bytes[j] && j) {
            if (!bytes[j]) continue
            const hex = llamaTokenizer.vocabByString.get(utf8ByteToHex(bytes[j] as number))
            tokenIds.push(hex)
            if (!(hex >= 0)) {
              // This is not supposed to happen because the LLaMA vocabulary has a token corresponding to each byte,
              // but if this happens regardless, let's follow the protocol and tokenize to <UNK> token instead of crashing.
              // biome-ignore lint/suspicious/noConsoleLog: <explanation>
              console.log(
                `Encountered unknown character ${c} (partial UTF-8 byte ${
                  bytes[j]
                } + hex + ${utf8ByteToHex(bytes[j] as number)})`,
              )
              tokenIds[tokenIds.length - 1] = 0
            }
          }
        }
      }
    }
    return tokenIds
  }
  
  const encode = (
    prompt: string,
    add_bos_token = true,
    add_preceding_space = true,
    log_performance = false,
  ) => {
    let startTime = null
    if (log_performance) {
      startTime = performance.now()
    }
  
    if (!llamaTokenizer.vocabById || !llamaTokenizer.vocabByString || !llamaTokenizer.merges) {
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      console.log('Tokenizer not initialized properly!')
      return
    }
    if (prompt.length === 0) {
      return []
    }
    // Initially each character i:s transformed to a tokenId, later there will be merges of these.
    const tokenIds = mapCharactersToTokenIds(prompt, add_bos_token, add_preceding_space)
  
    // Set up priority queue to efficiently iterate merge possibilities in priority order
    const mergeQueue = new PriorityQueue((a, b) => {
      return a.mergePrio < b.mergePrio
    })
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const addToMergeQueue = (leftNode: SortNode) => {
      const mergeIdentifierString = getMergeIdentifierString(
        leftNode.tokenId,
        (leftNode.next as SortNode).tokenId,
      )
      // Merge priority isly determin=> ed by the location of the merge in the "merges" data,
      // secondarily determined by the relative position of the node in the linked list
      // (We want to perfo merges fro=> m left to right)
      const mergePrio =
        llamaTokenizer.merges.get(mergeIdentifierString) + leftNode.origPos / prompt.length
      if (mergePrio) {
        // If mergePrio not found in merges, that means this merge is not possible according to vocabulary.
        leftNode.mergePrio = mergePrio
        leftNode.mergeToString = mergeIdentifierString.replace(' ', '')
        mergeQueue.push(leftNode)
      }
    }
  
    // Fill merge queue from initial merge possibilities and construct linked list
    let firstTokenNode = {
      origPos: 0,
      tokenId: tokenIds[0],
    } as SortNode
    let prevTokenNode = firstTokenNode
    for (let i = 1; i < tokenIds.length; i++) {
      const currTokenNode = {
        origPos: i,
        tokenId: tokenIds[i],
        prev: prevTokenNode,
        next: undefined,
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
          next: oldPrev.next,
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
        next: leftOfMerge.next.next as SortNode,
      } as SortNode
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
    for (
      let currTokenNode = firstTokenNode;
      currTokenNode !== undefined;
      currTokenNode = currTokenNode.next as SortNode
    ) {
      mergedTokenIds.push(currTokenNode.tokenId)
    }
  
    if (log_performance) {
      const endTime = performance.now()
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      console.log(`Tokenizer running time: ${endTime - (startTime ?? endTime)} milliseconds`)
    }
  
    return mergedTokenIds
  }
  
  const decode = (tokenIds: string[], add_bos_token = true, add_preceding_space = true) => {
    const utf8byteVals = []
    const startIndex = add_bos_token ? 1 : 0
    for (let i = startIndex; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i]
      if (!tokenId) {
        continue
      }
      const tokenString = llamaTokenizer.vocabById[tokenId]
      if (tokenString.startsWith('<0x') && tokenString.endsWith('>')) {
        // Special case
        const utf8byte = hexToUtf8Byte(tokenString)
        utf8byteVals.push(utf8byte)
      } else {
        // Typical case
        const utf8bytes = utf8Encoder.encode(tokenString)
        // biome-ignore lint/complexity/noForEach: <explanation>
        utf8bytes.forEach((utf8Byte) => utf8byteVals.push(utf8Byte))
      }
    }
    const uint8Array = new Uint8Array(utf8byteVals)
    const decodedString = utf8Decoder.decode(uint8Array)
    const spacesFixed = decodedString.replaceAll(llamaTokenizer.vocabById[29871], ' ')
    // Note that preceding space must be removed here at string level, not earlier at token level, because multiple consecutive spaces are represented as single token.
    return add_preceding_space ? spacesFixed.slice(1) : spacesFixed
  }
  
  function initializeLlamaTokenizer() {
    llamaTokenizer.encode = encode
    llamaTokenizer.decode = decode
    // llamaTokenizer.runTests = runTests
    // Array where index represents tokenId, value represents tokenString
    llamaTokenizer.vocabById = decodeVocabulary(vocab_base64)
    // Map where key represents tokenString, value represents tokenId
    llamaTokenizer.vocabByString = new Map()
    llamaTokenizer.vocabById.forEach((tokenString: string, tokenId: string) => {
      llamaTokenizer.vocabByString.set(tokenString, tokenId)
    })
    // Map where key identifies token pair, value represents merge priority
    llamaTokenizer.merges = decompressMerges(merges_binary)
  }
  
  const vocab_base64 =
    "PHVuaz4KPHM+Cjwvcz4KP<---Copy/paste this yourself because it's---->BuQrovrkK6L+YCum7gwrsmZUK5pS2CuW8mArnu5k="
  
  const merges_binary = 'r3SxdLB0tnSzdLR0r3<----Tooooo LOOOOOONGGGG---->vdMRJr3SvdA=='
  
  initializeLlamaTokenizer()
  
  export default llamaTokenizer
  