#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React frontend
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Helper to validate SSH host alias (alphanumeric, hyphens, underscores).
// Reject a leading '-' so the value can't masquerade as an ssh option flag.
const isValidHost = (host) => /^[a-zA-Z0-9_.][a-zA-Z0-9-_.]*$/.test(host);

// Helper to validate time (e.g. 2024-05-01, now-24h, etc)
// Slurm sacct --starttime accepts many formats. For simplicity and security, 
// we will only allow a few patterns or just check for "dangerous" characters.
const isValidSince = (since) => /^[a-zA-Z0-9-:]+$/.test(since);

app.get('/api/jobs', (req, res) => {
  const { host, since = 'now-1hours', jobId } = req.query;
  if (!host || !isValidHost(host)) {
    return res.status(400).json({ error: 'Invalid or missing host' });
  }

  if (!isValidSince(since)) {
    return res.status(400).json({ error: 'Invalid time format' });
  }

  // Validate jobId if provided (numeric, possibly with .batch extension, or comma-separated list)
  if (jobId && !/^[0-9.,]+$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid Job ID format' });
  }

  const format = 'JobID,JobName,State,ExitCode,ReqMem,MaxRSS,AllocCPUS,Elapsed,Start,End,WorkDir,NodeList,TotalCPU,SubmitLine,Timelimit';
  let slurmCmd = `sacct --parsable2 --format=${format} --starttime=${since}`;
  if (jobId) {
    // Slurm -j accepts a comma-separated list: 123,456,789
    slurmCmd = `sacct --parsable2 --format=${format} -j ${jobId}`;
  }
  
  const command = `ssh -o RemoteCommand=none -- ${host} '${slurmCmd}'`;

  console.log(`Executing: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: 'SSH Command failed', details: stderr || error.message });
    }

    // Strip potential TTY artifacts or carriage returns
    const cleanOutput = stdout.replace(/\r/g, '').replace(/Pseudo-terminal.*/g, '').trim();
    const lines = cleanOutput.split('\n');
    if (lines.length < 2) {
      return res.json([]);
    }

    const headers = lines[0].split('|');
    const jobsMap = {};
    
    lines.slice(1).forEach(line => {
      const values = line.split('|');
      const jobData = {};
      headers.forEach((header, index) => {
        jobData[header] = values[index];
      });

      const baseId = jobData.JobID.split('.')[0];
      
      if (!jobsMap[baseId]) {
        jobsMap[baseId] = jobData;
      } else {
        // Merge strategy: preserve values from any step that has them
        // If this is the .batch step, it usually has the most accurate MaxRSS info
        if (jobData.JobID.endsWith('.batch')) {
          jobsMap[baseId].MaxRSS = jobData.MaxRSS;
        }
        
        // Preserve NodeList, Command, and WorkDir if the current mapping is missing them
        if (!jobsMap[baseId].NodeList || jobsMap[baseId].NodeList === 'None' || jobsMap[baseId].NodeList === '') {
          if (jobData.NodeList && jobData.NodeList !== 'None' && jobData.NodeList !== '') {
            jobsMap[baseId].NodeList = jobData.NodeList;
          }
        }
        
        if (!jobsMap[baseId].Command || jobsMap[baseId].Command === '') {
          if (jobData.Command && jobData.Command !== '') {
            jobsMap[baseId].Command = jobData.Command;
          }
        }

        if (!jobsMap[baseId].WorkDir || jobsMap[baseId].WorkDir === '') {
          if (jobData.WorkDir && jobData.WorkDir !== '') {
            jobsMap[baseId].WorkDir = jobData.WorkDir;
          }
        }

        if (!jobsMap[baseId].SubmitLine || jobsMap[baseId].SubmitLine === '') {
          if (jobData.SubmitLine && jobData.SubmitLine !== '') {
            jobsMap[baseId].SubmitLine = jobData.SubmitLine;
          }
        }

        if (!jobsMap[baseId].Timelimit || jobsMap[baseId].Timelimit === '') {
          if (jobData.Timelimit && jobData.Timelimit !== '') {
            jobsMap[baseId].Timelimit = jobData.Timelimit;
          }
        }

        // If the main entry has an empty state, try to take it from the step
        if ((!jobsMap[baseId].State || jobsMap[baseId].State === '') && jobData.State) {
          jobsMap[baseId].State = jobData.State;
        }
      }
    });

    const result = Object.values(jobsMap);
    res.json(result);
  });
});

// Fallback to React app for any other requests (SPA support)
app.get('/*splat', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath);
});

app.listen(port, '127.0.0.1', () => {
  console.log(`\n--- Slurm Job Watcher ---`);
  console.log(`Backend:  http://localhost:${port}`);
  console.log(`Frontend: Serving from ${frontendPath}`);
});
