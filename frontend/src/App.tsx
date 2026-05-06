import { useState, useEffect, useCallback, useMemo } from 'react'

interface Job {
  JobID: string;
  JobName: string;
  State: string;
  ExitCode: string;
  ReqMem: string;
  MaxRSS: string;
  AllocCPUS: string;
  Elapsed: string;
  Start: string;
  End: string;
  WorkDir: string;
  NodeList: string;
  TotalCPU: string;
  SubmitLine: string;
  Timelimit: string;
}

type SortConfig = {
  key: keyof Job | 'BaseID';
  direction: 'asc' | 'desc';
} | null;

function RefreshStatus({ lastRefresh }: { lastRefresh: { time: Date; success: boolean } | null }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!lastRefresh) return null;

  const secondsAgo = Math.floor((now.getTime() - lastRefresh.time.getTime()) / 1000);
  const minutesAgo = Math.floor(secondsAgo / 60);
  
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-base-200 rounded-full border border-base-content/40 shadow-inner h-fit">
      <div className={`w-2 h-2 rounded-full ${lastRefresh.success ? 'bg-success animate-pulse' : 'bg-error'}`}></div>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 whitespace-nowrap">
        {minutesAgo === 0 ? 'Updated just now' : `Updated ${minutesAgo}m ago`}
      </span>
    </div>
  );
}

function App() {
  const [host, setHost] = useState(localStorage.getItem('slurm_host') || '');
  const [debouncedHost, setDebouncedHost] = useState(host);
  const [since, setSince] = useState('now-1hours');
  const [refreshInterval, setRefreshInterval] = useState(0); 
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isRefreshingJob, setIsRefreshingJob] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('slurm_theme') || 'garden');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<{ time: Date; success: boolean } | null>(null);

  // Filtering State
  const [filters, setFilters] = useState({
    id: '',
    name: '',
    state: [] as string[],
  });

  // Sorting State - default to most recent (highest ID) on top
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'BaseID', direction: 'desc' });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('slurm_theme', theme);
  }, [theme]);

  const selectedJob = jobs.find(j => j.JobID.split('.')[0] === selectedJobId);

  // Debounce host input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHost(host);
    }, 500);
    return () => clearTimeout(timer);
  }, [host]);

  const fetchJobs = useCallback(async (onlyActive = false) => {
    if (!debouncedHost) return;
    const activeJobs = jobs.filter(j => j.State.includes('RUNNING') || j.State.includes('PENDING'));
    if (onlyActive && activeJobs.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      let url = `http://localhost:3001/api/jobs?host=${debouncedHost}`;
      if (onlyActive) {
        const ids = activeJobs.map(j => j.JobID.split('.')[0]).join(',');
        url += `&jobId=${ids}`;
      } else {
        url += `&since=${since}`;
      }

      const response = await fetch(url);
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error || 'Failed to fetch jobs');
        
        if (onlyActive) {
          setJobs(prev => prev.map(oldJob => {
            const updated = data.find((newJob: Job) => newJob.JobID.split('.')[0] === oldJob.JobID.split('.')[0]);
            return updated || oldJob;
          }));
        } else {
          setJobs(data);
        }
        setLastRefresh({ time: new Date(), success: true });
      } else {
        const text = await response.text();
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
      }
    } catch (err: any) {
      setError(err.message);
      setLastRefresh({ time: new Date(), success: false });
    } finally {
      setLoading(false);
    }
  }, [debouncedHost, since, jobs]);

  const refreshSingleJob = async () => {
    if (!selectedJobId || !debouncedHost) return;
    setIsRefreshingJob(true);
    try {
      const response = await fetch(`http://localhost:3001/api/jobs?host=${debouncedHost}&jobId=${selectedJobId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.details || data.error || 'Failed to refresh job');
      }
      const data = await response.json();
      if (data.length > 0) {
        const refreshedJob = data.find((j: Job) => j.JobID.split('.')[0] === selectedJobId);
        if (refreshedJob) {
          setJobs(prev => prev.map(j => j.JobID.split('.')[0] === selectedJobId ? refreshedJob : j));
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsRefreshingJob(false);
    }
  };

  useEffect(() => {
    fetchJobs(false);
  }, [debouncedHost, since]);

  useEffect(() => {
    localStorage.setItem('slurm_host', host);
  }, [host]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => fetchJobs(true), refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchJobs]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    });
  };

  const parseSlurmValue = (val: string) => {
    if (!val || val === '-' || val === '0') return 0;
    const units: { [key: string]: number } = { 'K': 1, 'M': 1024, 'G': 1024 * 1024, 'T': 1024 * 1024 * 1024 };
    const unit = val.slice(-1).toUpperCase();
    const num = parseFloat(val.slice(0, -1));
    if (units[unit]) return num * units[unit];
    if (/[0-9]/.test(unit)) return parseFloat(val);
    return 0;
  };

  const parseSlurmTime = (time: string) => {
    if (!time || time === '-' || time === 'Unknown') return 0;
    let days = 0;
    let parts = time.split('-');
    if (parts.length > 1) {
      days = parseInt(parts[0]);
      time = parts[1];
    }
    const [h, m, s] = time.split(':').map(x => parseInt(x) || 0);
    return days * 86400 + h * 3600 + m * 60 + s;
  };

  const getStatusBadge = (state: string) => {
    if (state.includes('COMPLETED')) return 'badge-success';
    if (state.includes('CANCELLED')) return 'badge-ghost';
    if (state.includes('FAILED') || state.includes('TIMEOUT')) return 'badge-error';
    if (state.includes('RUNNING')) return 'badge-primary';
    if (state.includes('PENDING')) return 'badge-warning';
    return 'badge-ghost';
  };

  // Processed (Filtered & Sorted) Jobs
  const processedJobs = useMemo(() => {
    let filtered = jobs.filter(job => {
      const baseId = job.JobID.split('.')[0];
      const matchesId = baseId.toLowerCase().includes(filters.id.toLowerCase());
      const matchesName = job.JobName.toLowerCase().includes(filters.name.toLowerCase());
      const matchesState = filters.state.length === 0 || filters.state.some(s => job.State.includes(s));
      return matchesId && matchesName && matchesState;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal: any, bVal: any;
        
        if (sortConfig.key === 'BaseID') {
          aVal = parseInt(a.JobID.split('.')[0]) || 0;
          bVal = parseInt(b.JobID.split('.')[0]) || 0;
        } else if (['ReqMem', 'MaxRSS'].includes(sortConfig.key)) {
          aVal = parseSlurmValue(a[sortConfig.key as keyof Job] as string);
          bVal = parseSlurmValue(b[sortConfig.key as keyof Job] as string);
        } else if (['Elapsed', 'TotalCPU'].includes(sortConfig.key)) {
          aVal = parseSlurmTime(a[sortConfig.key as keyof Job] as string);
          bVal = parseSlurmTime(b[sortConfig.key as keyof Job] as string);
        } else if (sortConfig.key === 'AllocCPUS') {
          aVal = parseInt(a.AllocCPUS) || 0;
          bVal = parseInt(b.AllocCPUS) || 0;
        } else {
          aVal = a[sortConfig.key as keyof Job] || '';
          bVal = b[sortConfig.key as keyof Job] || '';
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [jobs, filters, sortConfig]);

  const requestSort = (key: keyof Job | 'BaseID') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
    return sortConfig.direction === 'asc' ? (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-base-300/30 p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-content/40 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Slurm Job Watcher</h1>
            <RefreshStatus lastRefresh={lastRefresh} />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold">SSH Host</span>
              </label>
              <input 
                type="text" 
                placeholder="e.g. cluster-alias" 
                className="input input-bordered input-sm w-40"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold">Time Window</span>
              </label>
              <select 
                className="select select-bordered select-sm w-36"
                value={since}
                onChange={(e) => setSince(e.target.value)}
              >
                <option value="now-1hours">Last 1 Hour</option>
                <option value="now-6hours">Last 6 Hours</option>
                <option value="now-24hours">Last 24 Hours</option>
                <option value="now-7days">Last 7 Days</option>
                <option value="now-30days">Last 30 Days</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold">Refresh</span>
              </label>
              <select 
                className="select select-bordered select-sm w-24"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={300}>5m</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-semibold">Theme</span>
              </label>
              <select 
                className="select select-bordered select-sm w-44"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="garden">Spring (Garden)</option>
                <option value="cupcake">Soft (Cupcake)</option>
                <option value="pastel">Pastel</option>
                <option value="emerald">Fresh (Emerald)</option>
                <option value="bumblebee">Yellow (Bee)</option>
                <option value="corporate">Corporate</option>
                <option value="nord">Nordic</option>
                <option value="sunset">Sunset (Dark)</option>
                <option value="night">Night (Dark)</option>
              </select>
            </div>

            <button 
              className={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`}
              onClick={() => fetchJobs(false)}
              disabled={!host}
            >
              Refresh All
            </button>
          </div>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error shadow-lg flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
            <button 
              className="btn btn-ghost btn-xs btn-circle"
              onClick={() => setError(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Jobs Table */}
          <div className="flex-grow bg-base-100 rounded-xl border border-base-content/40 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
            <div className="overflow-auto flex-grow">
              <table className="table w-full table-pin-rows">
                <thead>
                  <tr className="bg-base-100">
                    <th className="w-24 text-center cursor-pointer hover:bg-base-200 z-[11]" onClick={() => requestSort('BaseID')}>
                      <div className="flex items-center justify-center gap-1">
                        ID {getSortIcon('BaseID')}
                      </div>
                    </th>
                    <th className="cursor-pointer hover:bg-base-200 z-[11]" onClick={() => requestSort('JobName')}>
                      <div className="flex items-center gap-1">
                        Job Name {getSortIcon('JobName')}
                      </div>
                    </th>
                    <th className="w-40 cursor-pointer hover:bg-base-200 z-[11]" onClick={() => requestSort('State')}>
                      <div className="flex items-center gap-1">
                        State {getSortIcon('State')}
                      </div>
                    </th>
                    <th className="w-40 cursor-pointer hover:bg-base-200 z-[11]" onClick={() => requestSort('AllocCPUS')}>
                      <div className="flex items-center gap-1">
                        Req. {getSortIcon('AllocCPUS')}
                      </div>
                    </th>
                    <th className="w-32 cursor-pointer hover:bg-base-200 z-[11]" onClick={() => requestSort('Elapsed')}>
                      <div className="flex items-center gap-1">
                        Elapsed {getSortIcon('Elapsed')}
                      </div>
                    </th>
                  </tr>
                  {/* Filter Row */}
                  <tr className="bg-base-100 border-b-2">
                    <th className="p-2 z-[10] bg-base-100">
                      <input 
                        type="text" 
                        placeholder="ID..." 
                        className="input input-bordered input-xs w-full font-normal"
                        value={filters.id}
                        onChange={(e) => setFilters(f => ({...f, id: e.target.value}))}
                      />
                    </th>
                    <th className="p-2">
                      <input 
                        type="text" 
                        placeholder="Filter name..." 
                        className="input input-bordered input-xs w-full font-normal"
                        value={filters.name}
                        onChange={(e) => setFilters(f => ({...f, name: e.target.value}))}
                      />
                    </th>
                    <th className="p-2">
                      <div className="dropdown dropdown-bottom w-full">
                        <label tabIndex={0} className="btn btn-outline btn-xs w-full font-normal justify-between flex-nowrap overflow-hidden bg-base-100">
                          <span className="truncate">
                            {filters.state.length === 0 ? 'All States' : filters.state.join(', ')}
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </label>
                        <ul tabIndex={0} className="dropdown-content z-[10] menu p-2 shadow bg-base-100 rounded-box w-52 border border-base-300">
                          {['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].map(state => (
                            <li key={state}>
                              <label className="label cursor-pointer justify-start gap-3 py-1">
                                <input 
                                  type="checkbox" 
                                  className="checkbox checkbox-primary checkbox-xs" 
                                  checked={filters.state.includes(state)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFilters(f => ({
                                      ...f,
                                      state: checked 
                                        ? [...f.state, state] 
                                        : f.state.filter(s => s !== state)
                                    }));
                                  }}
                                />
                                <span className="label-text text-xs font-bold">{state}</span>
                              </label>
                            </li>
                          ))}
                          <div className="divider my-1"></div>
                          <li>
                            <button 
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => setFilters(f => ({ ...f, state: [] }))}
                            >
                              Clear Filters
                            </button>
                          </li>
                        </ul>
                      </div>
                    </th>
                    <th colSpan={2}></th>
                  </tr>
                </thead>
                <tbody>
                  {processedJobs.length === 0 && !loading && !error && (
                    <tr>
                      <td colSpan={5} className="text-center py-20 text-base-content/50">
                        {host ? 'No jobs match your filters.' : 'Enter an SSH host to get started.'}
                      </td>
                    </tr>
                  )}
                  {processedJobs.map((job) => {
                    const baseId = job.JobID.split('.')[0];
                    const isSelected = selectedJobId === baseId;
                    return (
                      <tr 
                        key={job.JobID} 
                        className={`hover cursor-pointer transition-colors ${isSelected ? 'bg-primary/20 shadow-inner' : ''}`}
                        onClick={() => setSelectedJobId(baseId)}
                      >
                        <td className={`font-mono text-sm font-bold text-center py-4 ${isSelected ? 'border-l-4 border-primary' : 'border-l-4 border-transparent'}`}>
                          {baseId}
                        </td>
                        <td>
                          <div className="font-bold text-sm">{job.JobName}</div>
                        </td>
                        <td>
                          <div className={`badge ${getStatusBadge(job.State)} py-3 px-3 font-bold whitespace-nowrap`}>
                            {job.State}
                          </div>
                        </td>
                        <td className="text-sm py-4">
                          {job.AllocCPUS}C / {job.ReqMem}
                        </td>
                        <td className="text-sm py-4 font-mono">
                          {job.Elapsed}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details Side Panel */}
          <div className={`lg:w-96 flex-shrink-0 flex flex-col h-[calc(100vh-220px)] min-h-[500px] ${selectedJobId ? 'block' : 'hidden lg:block'}`}>
            <div className="card bg-base-100 border border-base-content/40 shadow-sm rounded-xl h-full flex flex-col overflow-hidden">
              <div className="card-body p-6 rounded-xl overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="card-title text-lg">Job Details</h2>
                  {selectedJob && (
                    <button 
                      className={`btn btn-primary btn-xs gap-1 shadow-sm ${isRefreshingJob ? 'loading' : ''}`}
                      onClick={(e) => { e.stopPropagation(); refreshSingleJob(); }}
                    >
                      {!isRefreshingJob && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      )}
                      Refresh
                    </button>
                  )}
                </div>

                {selectedJob ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-y-3 text-sm items-center">
                      <div className="text-base-content/60 font-medium">Job ID</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{selectedJob.JobID.split('.')[0]}</span>
                        <button 
                          className="btn btn-ghost btn-xs px-1 hover:bg-base-300" 
                          onClick={() => copyToClipboard(selectedJob.JobID.split('.')[0])}
                          title="Copy ID"
                        >
                          {copiedText === selectedJob.JobID.split('.')[0] ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-success">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 opacity-60">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          )}
                        </button>
                      </div>
                      
                      <div className="text-base-content/60 font-medium">Name</div>
                      <div className="font-bold">{selectedJob.JobName}</div>
                      
                      <div className="text-base-content/60 font-medium">State</div>
                      <div>
                        <span className={`badge ${getStatusBadge(selectedJob.State)} badge-sm`}>
                          {selectedJob.State}
                        </span>
                      </div>

                      {selectedJob.ExitCode !== '0:0' && (
                        <>
                          <div className="text-base-content/60 font-medium">Exit Code</div>
                          <div className="text-error font-mono">{selectedJob.ExitCode}</div>
                        </>
                      )}
                    </div>

                    <div className="divider my-0"></div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">Resources</h3>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div className="text-base-content/60">Allocated CPUs</div>
                        <div>{selectedJob.AllocCPUS}</div>
                        
                        <div className="text-base-content/60">CPU Efficiency</div>
                        <div className="font-bold">
                          {(() => {
                            const total = parseSlurmTime(selectedJob.TotalCPU);
                            const elapsed = parseSlurmTime(selectedJob.Elapsed);
                            const cpus = parseInt(selectedJob.AllocCPUS) || 1;
                            if (elapsed === 0) return '-';
                            const percent = Math.round((total / (elapsed * cpus)) * 100);
                            return (
                              <div className="flex items-center gap-2">
                                <progress className={`progress w-16 ${percent > 80 ? 'progress-success' : percent > 40 ? 'progress-warning' : 'progress-error'}`} value={percent} max="100"></progress>
                                <span>{percent}%</span>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="text-base-content/60">Memory (Used/Req)</div>
                        <div className="font-bold">
                          {(() => {
                            const used = parseSlurmValue(selectedJob.MaxRSS);
                            let req = parseSlurmValue(selectedJob.ReqMem);
                            if (selectedJob.ReqMem.toLowerCase().endsWith('c')) {
                              req *= (parseInt(selectedJob.AllocCPUS) || 1);
                            }
                            if (req === 0 || used === 0) return `${selectedJob.MaxRSS || '-'} / ${selectedJob.ReqMem}`;
                            const percent = Math.round((used / req) * 100);
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <progress className={`progress w-16 ${percent > 90 ? 'progress-error' : percent > 70 ? 'progress-warning' : 'progress-success'}`} value={percent} max="100"></progress>
                                  <span>{percent}%</span>
                                </div>
                                <span className="text-[10px] opacity-50 font-normal">{selectedJob.MaxRSS} of {selectedJob.ReqMem}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="divider my-0"></div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">Timing</h3>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div className="text-base-content/60">Time Limit</div>
                        <div className="font-mono font-bold">{selectedJob.Timelimit}</div>

                        <div className="text-base-content/60">Time Usage</div>
                        <div className="font-bold">
                          {(() => {
                            const elapsed = parseSlurmTime(selectedJob.Elapsed);
                            const limit = parseSlurmTime(selectedJob.Timelimit);
                            if (limit === 0 || elapsed === 0) return '-';
                            const percent = Math.min(Math.round((elapsed / limit) * 100), 100);
                            return (
                              <div className="flex items-center gap-2">
                                <progress className={`progress w-16 ${percent > 90 ? 'progress-error' : percent > 75 ? 'progress-warning' : 'progress-success'}`} value={percent} max="100"></progress>
                                <span>{percent}%</span>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="text-base-content/60">Elapsed</div>
                        <div className="font-mono">{selectedJob.Elapsed}</div>
                        <div className="text-base-content/60">Started</div>
                        <div className="text-xs">
                          {selectedJob.Start === 'Unknown' ? '-' : new Date(selectedJob.Start).toLocaleString()}
                        </div>
                        <div className="text-base-content/60">Ended</div>
                        <div className="text-xs">
                          {selectedJob.End === 'Unknown' ? '-' : new Date(selectedJob.End).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="divider my-0"></div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">Nodes</h3>
                        <button 
                          className="btn btn-ghost btn-xs px-1 hover:bg-base-300" 
                          onClick={() => copyToClipboard(selectedJob.NodeList)}
                          title="Copy Nodes"
                        >
                          {copiedText === selectedJob.NodeList ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-success">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 opacity-60">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="bg-base-200 p-2 rounded text-[10px] font-mono break-all leading-relaxed">
                        {selectedJob.NodeList}
                      </div>
                    </div>

                    <div className="divider my-0"></div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">Command</h3>
                      <div className="bg-base-200 p-2 rounded text-[10px] font-mono break-all leading-relaxed max-h-32 overflow-y-auto">
                        {selectedJob.SubmitLine}
                      </div>
                    </div>

                    <div className="divider my-0"></div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">Working Directory</h3>
                        <button 
                          className="btn btn-ghost btn-xs px-1 hover:bg-base-300" 
                          onClick={() => copyToClipboard(selectedJob.WorkDir)}
                          title="Copy Working Directory"
                        >
                          {copiedText === selectedJob.WorkDir ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-success">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 opacity-60">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="bg-base-200 p-2 rounded text-[10px] font-mono break-all leading-relaxed">
                        {selectedJob.WorkDir}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-base-content/30 border-2 border-dashed border-base-300 rounded-lg">
                    Select a job to view details
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
