# AI Website Builder

An AI tool that creates a working website from a simple text prompt, checks and fixes its own work, and lets you deploy the result to Vercel with one click.

**Live demo:** [https://agentic-web-builder.onrender.com/]

> Hosted on Render's free plan, so the first load can take about 30-60 seconds while the server wakes up.

## Problem it solves

Most AI website builders give a buggy or ugly first result, and the user has to fix it manually. This project makes the AI test its own output and improve it automatically. Once the site is ready, it can go live without any manual setup.

## How it works

The project uses four AI agents:

1. **Builder** writes the website code from the user's prompt.
2. **Critic** opens the site using Playwright and runs Lighthouse to find problems (broken layout, slow loading, poor accessibility).
3. **Fixer** reads the Critic's feedback and corrects the code.
4. **Modifier** updates the finished website when the user asks for a change, for example "make the header blue" or "add a contact section".

Builder, Critic, and Fixer run in a loop [2-3] times until the site passes the checks. After that, the user can ask for changes, and the Modifier edits the existing site without rebuilding it from scratch. When the user is happy with the result, they click **Publish Website** and the site is published to a live link through vercel.

## Features

- **Choose your tech stack:** before generating, the user picks what the website is built with:
  - HTML + CSS + JS: simple interactive site (buttons, forms, animations)
  - HTML + Tailwind CSS: same as above, styled with Tailwind
  - React: component-based, good for pages with tabs and live widgets
  - React + Tailwind CSS: component-based with Tailwind styling (default)
- **Self-checking:** the Critic and Fixer agents test and repair the site automatically.
- **Edit after building:** the Modifier agent changes the site when the user asks.
- **One-click deploy to Vercel:** after the website is generated, the user can publish it to Vercel with a single click and get a shareable live URL.

## Tech stack

- Groq API (free tier) for the LLMs
- Playwright for opening and testing the generated site
- Lighthouse CLI for performance and accessibility scores
- Render for hosting this app
- Vercel api key for deploying the generated websites
- Generated websites can use: HTML/CSS/JS, Tailwind CSS, React (via CDN)
- HTML, CSS, javascript

## How to run it

Don't want to install anything? Try the live demo above.

1. Clone the project and open the folder:
```
   git clone https://github.com/[your-username]/[repo-name].git
   cd [repo-name]
```
2. Install dependencies:
```
   pip install -r requirements.txt
   playwright install
```
3. Get a free API key from [console.groq.com](https://console.groq.com), and a Vercel token from [vercel.com/account/tokens](https://vercel.com/account/tokens).
4. Create a file named `.env` in the project folder and add your keys. Replace the placeholder text with your own values:
```dotenv
   GROQ_API_KEY=your_groq_api_key_here
   VERCEL_TOKEN=your_vercel_api_key_here
```
   Without a Groq key the project will not work, and without a Vercel token the Deploy to Vercel button will not work.
5. Run the project:
```
   npm start
```
6. Choose a tech stack from the dropdown (HTML + CSS + JS, HTML + Tailwind, React, or React + Tailwind), enter a prompt like "Make a portfolio website for a photographer", and wait for the result.
7. After the site is built, type a change request (for example "make the background dark") and the Modifier agent will update it.
8. When you are happy with the site, click **Publish Website** to publish it and get a live link.

## How I used AI tools

- Claude, ChatGPT: planning, debugging, learning concepts
- GitHub Copilot, Antigravity: faster coding
- Groq models api keys used in: the Builder, Critic, Fixer, and Modifier agents inside the webapp

## What I learned

AI output improves a lot when you test it and give it clear feedback, not only when you write a better prompt.

## Built by Sneha
