# Slurm Job Watcher

A minimalist web dashboard for monitoring your Slurm jobs on remote clusters. Built with React, DaisyUI, and Node.js.

## Features

- **Real-time Monitoring:** Configurable auto-refresh to watch active jobs.
- **Insights:**
    - **CPU Efficiency:** Visual indicators of how effectively your job uses allocated cores.
    - **Memory Utilization:** Track `MaxRSS` against requested memory.
    - **Time Usage:** Progress bars showing elapsed time vs. requested time limit.
- **Advanced Filtering:** Filter by ID, Job Name, or multiple States simultaneously.
- **Dynamic Sorting:** Sort by any column, with smart handling of Slurm time and memory units.
- **Zero Configuration SSH:** Uses your local `~/.ssh/config` aliases and keys automatically.

## Prerequisites

- **Node.js:** Version 18 or newer.
- **SSH Access:** You must have SSH keys and host aliases configured in your `~/.ssh/config` for the clusters you wish to monitor.

## Getting Started

Run the published package directly with `npx` (no clone, no global install):

```bash
npx @misialq/slurm-job-watcher
```

Or install it globally:

```bash
npm install -g @misialq/slurm-job-watcher
slurm-job-watcher
```

Either way, the server starts at **http://localhost:3001**.

## Usage

1. Open **http://localhost:3001** in your browser.
2. Enter your **SSH Host** alias (from your `.ssh/config`).
3. Select your desired **Time Window** (e.g., Last 1 Hour, Last 24 Hours).
4. Click on any job in the list to see detailed resource metrics in the right-hand panel.

## Architecture

- **Frontend:** React + Vite + TailwindCSS + DaisyUI.
- **Backend:** Node.js + Express.
- **Security:** Strictly read-only. The backend only executes the `sacct` command via SSH. It uses `-o RemoteCommand=none` to ensure compatibility with restricted SSH configurations.
