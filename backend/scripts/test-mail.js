const { sendMail, configured } = require('../src/mailer');

async function main() {
  const to = process.argv[2];

  console.log('Step 1: Checking SMTP configuration...');

  if (!to) {
    console.log('Email address missing.');
    return;
  }

  if (!configured()) {
    console.log('SMTP is not configured. Check .env file.');
    return;
  }

  console.log('Step 2: Sending test email...');

  try {
    await sendMail(
      to,
      'SafeVoice PK Email Test',
      'Your email configuration is working.'
    );
    console.log('SUCCESS: Email sent!');
  } catch (error) {
    console.error('FAILED:', error.message);
  }
}

main();
