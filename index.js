const chromium = require('chrome-aws-lambda');
const userAgent = require('user-agents');

const AWS = require('aws-sdk');
const { PRIORITY_ABOVE_NORMAL } = require('constants');
const SES = new AWS.SES();

exports.handler = async (event, context, callback) => {    
    let result = null;
    let browser = null;

    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: true,
            ignoreHTTPSErrors: true
        });

        let page = await browser.newPage();
        let title = await page.title();

        const emailParams = {
            Destination: {
                ToAddresses: ['johnsmith@example.com'],
            },
            Message: {
                Body: {
                    Html: { Data: `Tickets available for event: ${title} (${event.url})` }                    
                },
                Subject: {
                    Data: 'RA checker: tickets available'
                },
            },
            Source: 'notifications@rachecker.com'
        }

        await page.setUserAgent(userAgent.toString());
        await page.goto(event.url || 'https://example.com');
        await page.waitForSelector('iframe');

        const frameHandle = await page.$('#tickets iframe');
        const frame = await frameHandle.contentFrame();

        page.on('console', (msg) => console.log(msg.text()));

        result = await frame.evaluate(() => {
            const openTiers = document.querySelectorAll('[data-ticket-info-selector-id="tickets-info"] li.onsale');
            const available = openTiers.length > 0;
            return available;
        })

        if (result) {
            console.log('sending email...');
            try {
                await SES.sendEmail(emailParams).promise();
                console.log('email sent successfully');
            } catch (e) {
                console.error(e);
            }            
        }

        return result;   

    } catch (error) {
        console.error(error);
        return callback(error);

    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }

    return callback(null, result);
};
