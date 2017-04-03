import * as vscode from 'vscode'
import * as fs from 'fs'

import {Extension} from './../main'

const bibEntries = ['article', 'book', 'booklet', 'conference', 'inbook',
                    'incollection', 'inproceedings', 'manual', 'mastersthesis',
                    'misc', 'phdthesis', 'proceedings', 'techreport',
                    'unpublished']

export class Citation {
    extension: Extension
    suggestions: vscode.CompletionItem[]
    citationInBib: { [id: string]: any[] } = {}
    refreshTimer: number

    constructor(extension: Extension) {
        this.extension = extension
    }

    provide() : vscode.CompletionItem[] {
        if (Date.now() - this.refreshTimer < 1000) {
            return this.suggestions
        }
        this.refreshTimer = Date.now()

        // Retrieve all Bib items for all known bib files in a flat list
        const items: any[] = []
        Object.keys(this.citationInBib).forEach(bibPath => {
            this.citationInBib[bibPath].forEach(item => items.push(item))
        })

        this.suggestions = items.map(item => {
            const citation = new vscode.CompletionItem(item.key, vscode.CompletionItemKind.Reference)
            citation.detail = item.title
            citation.filterText = `${item.author} ${item.title} ${item.journal}`
            citation.insertText = item.key
            citation.documentation = Object.keys(item)
                .filter(key => (key !== 'key' && key !== 'title'))
                .sort()
                .map(key => `${key}: ${item[key]}`)
                .join('\n')
            return citation
        })
        return this.suggestions
    }

    parseBibItems(bibPath: string) {
        this.extension.logger.addLogMessage(`Parsing .bib entries from ${bibPath}`)
        const items: any[] = []
        const content = fs.readFileSync(bibPath, 'utf-8').replace(/[\r\n]/g, ' ')
        const itemReg = /@(\w+){/g
        let result = itemReg.exec(content)
        let prevResult: RegExpExecArray | null = null
        while (result || prevResult) {
            if (prevResult && bibEntries.indexOf(prevResult[1].toLowerCase()) > -1) {
                const item = content.substring(prevResult.index, result ? result.index : undefined).trim()
                items.push(this.splitBibItem(item))
            }
            prevResult = result
            if (result) {
                result = itemReg.exec(content)
            }
        }
        this.extension.logger.addLogMessage(`Parsed ${items.length} .bib entries from ${bibPath}.`)
        this.citationInBib[bibPath] = items
    }

    forgetParsedBibItems(bibPath: string) {
        this.extension.logger.addLogMessage(`Forgetting parsed bib entries for ${bibPath}`)
        delete this.citationInBib[bibPath]
    }

    splitBibItem(item: string) {
        let unclosed = 0
        let lastSplit = -1
        const segments: any[] = []

        for (let i = 0; i < item.length; i++) {
            const char = item[i]
            if (char === '{' && item[i - 1] !== '\\') {
                unclosed++
            } else if (char === '}' && item[i - 1] !== '\\') {
                unclosed--
            } else if (char === ',' && unclosed === 1) {
                segments.push(item.substring(lastSplit + 1, i).trim())
                lastSplit = i
            }
        }

        segments.push(item.substring(lastSplit + 1).trim())
        const bibItem = { key: segments.shift() }
        bibItem.key = bibItem.key.substring(bibItem.key.indexOf('{') + 1)

        let last = segments[segments.length - 1]
        last = last.substring(0, last.lastIndexOf('}'))

        segments[segments.length - 1] = last

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i]
            const eqSign = segment.indexOf('=')
            const key = segment.substring(0, eqSign).trim()
            let value = segment.substring(eqSign + 1).trim()
            if (value[0] === '{' && value[value.length - 1] === '}') {
                value = value.substring(1, value.length - 1)
            }
            value = value.replace(/(\\.)|({)/g, '$1').replace(/(\\.)|(})/g, '$1')
            bibItem[key.toLowerCase()] = value
        }
        return bibItem
    }
}