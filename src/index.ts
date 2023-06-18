import { DnsRecord as CFDnsRecord } from 'cloudflare'
import { config } from 'dotenv'
import fs from 'fs'

type DnsRecord = CFDnsRecord & {
    id: string
}

config()

async function fetchPublicIp(): Promise<string> {
    const response = await fetch('http://api.ipify.org')

    return response.text()
}

async function getCurrentDnsRecords(): Promise<Array<DnsRecord>> {
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`,
        {
            headers: {
                Authorization: `Bearer ${process.env.API_KEY}`,
            },
        },
    )

    const result = (await response.json()) as { result: Array<DnsRecord> }
    return result.result
}

async function updateDnsRecord(dnsRecord: DnsRecord, publicIp: string) {
    if (dnsRecord.type !== 'A') return

    if (dnsRecord.content === publicIp) return

    await fetch(
        `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${dnsRecord.id}`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${process.env.API_KEY}`,
            },
            body: JSON.stringify({
                ...dnsRecord,
                content: publicIp,
                comment: `Last updated on ${new Date()}`,
            }),
        },
    )
}

function log(err: Error, text?: unknown) {
    let data = `\n------------------------------------------\n${new Date()} ${
        err.message
    } \n${err.stack}`

    if (text) data += `\n${String(text)}`

    fs.appendFileSync(process.env.LOG_FILE || 'script.log', data, {
        encoding: 'utf-8',
    })
}

async function main() {
    try {
        const publicIp = await fetchPublicIp()

        const records = await getCurrentDnsRecords()

        const results = await Promise.allSettled(
            records.map((record) => updateDnsRecord(record, publicIp)),
        )

        results.forEach((value, index) => {
            if (value.status === 'rejected') {
                log(
                    new Error(value.reason),
                    `failed at dns record index=${index}`,
                )
            }
        })
    } catch (error) {
        if (error instanceof Error) {
            log(error)
        } else if (typeof error === 'string') {
            log(new Error(error))
        } else {
            log(new Error('Unknown error'), error)
        }
    }
}

main()
