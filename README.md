# Chromium Helper

<img align="right" src="https://avatars.githubusercontent.com/u/11941053?v=4">

This bot, when deployed as a Heroku app, will unfurl Chromium related URLs to provide context in Slack.

The URLs this bot currently supports are:
* `https://crbug.com/12345`
* `https://bugs.chromium.org/p/chromium/issues/detail?id=12345`
* `https://chromium-review.googlesource.com/c/chromium/src/+/123456`
* `https://source.chromium.org/chromium/chromium/src/+/master:chrome/app/main_dll_loader_win.cc`
* `https://source.chromium.org/chromium/chromium/src/+/master:chrome/app/main_dll_loader_win.cc;l=101`
* `https://source.chromium.org/chromium/chromium/src/+/master:chrome/app/main_dll_loader_win.cc;l=101-110`

## What does it look like?

![image](https://user-images.githubusercontent.com/6634592/113898062-5e61ae00-9780-11eb-8df1-e43fa261f66f.png)

## Configuration

The following environment variables need to be set:

 * `SLACK_TOKEN`: Slack bot token
 * `SLACK_SIGNING_SECRET`: Slack app signing secret
 * `SLACK_BOT_ID`: User id of Slack app

## Routes

`/slack/events`: Used by Slack, you _probably_ don't want to call this yourself.
