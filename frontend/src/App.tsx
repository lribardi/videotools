import { useState, useCallback } from 'react';
import { Video, Scissors, RefreshCw, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import type { Scene } from './types';
import { SceneList } from './components/SceneList';

function App() {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [analyzedPath, setAnalyzedPath] = useState('');
  const [error, setError] = useState('');
  const [splitResult, setSplitResult] = useState<string[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [threshold, setThreshold] = useState(27.0);
  const [fps, setFps] = useState(0);
  const [eta, setEta] = useState(0);
  const [detectedScenes, setDetectedScenes] = useState(0);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m ${s}s`;
  };

  const readStream = async (res: Response, onProgress: (val: number) => void): Promise<any> => {
    if (!res.body) throw new Error('No body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep partial line

      for (const line of lines) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            onProgress(msg.value);
            if (msg.fps) setFps(Math.round(msg.fps));
            if (msg.eta) setEta(Math.round(msg.eta));
            if (msg.scenes) setDetectedScenes(msg.scenes);
          } else if (msg.type === 'error') {
            throw new Error(msg.message);
          } else if (msg.type === 'complete') {
            return msg;
          }
        } catch (e) {
          console.error("Parse error", e);
        }
      }
    }
  };

  const handleAnalyze = async (autoSplit = false) => {
    if (!path) return;
    setLoading(true);
    setProgress(0);
    setStatus('Detecting scenes...');
    setError('');
    setScenes([]);
    setSplitResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, threshold, use_ai: false }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await readStream(res, (val) => setProgress(val));
      if (data) {
        setScenes(data.scenes);
        setAnalyzedPath(data.video_path);
        setStatus(`Analysis complete. Found ${data.scenes.length} scenes.`);

        if (autoSplit && data.scenes.length > 0) {
          // Chain the split immediately
          await handleSplit(data.scenes, data.video_path);
        }
      } else {
        throw new Error('Server closed connection without result.');
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      // Only reset loading if we didn't chain into auto-split (checked via status change?)
      // Actually handleSplit sets loading=true internally. 
      // But if we are in autoSplit, handleSplit will be awaited inside the try block.
      // So when handleSplit finishes, it enters its own finally block which sets loading=false.
      // THEN this handleAnalyze function finishes and hits THIS finally block, setting loading=false again.
      // This is fine.
      if (!autoSplit) {
        setLoading(false);
        setProgress(0);
      } else {
        // If autoSplit was requested but failed (e.g. 0 scenes), we should ensure loading is off.
        // If it succeeded, handleSplit took over. 
        // We can just safely set loading false here as a fail-safe, 
        // BUT if handleSplit is running async but we awaited it...

        // Wait, if I await handleSplit, it finishes completely before we get here.
        // So setting loading=false here is correct.
        setLoading(false);
        setProgress(0);
      }
    }
  };

  const handleSplit = async (scenesArg?: Scene[], pathArg?: string) => {
    const scenesToUse = scenesArg || scenes;
    const pathToUse = pathArg || analyzedPath;

    if (!scenesToUse.length || !pathToUse) return;

    setLoading(true);
    setProgress(0);
    setStatus('Splitting video files...');
    setError('');

    try {
      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: pathToUse, scenes: scenesToUse }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await readStream(res, (val) => setProgress(val));
      if (data) {
        setSplitResult(data.files);
        setStatus(`Successfully split into ${data.files.length} files.`);
      }
    } catch (err: any) {
      setError(err.message || 'Split failed');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('video/')) {
      setError('Please drop a video file.');
      return;
    }

    setLoading(true);
    setStatus('Uploading file...');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setPath(data.path);
      setStatus(`Uploaded: ${data.filename}`);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen p-8 flex items-center justify-center">
      <div className="w-full max-w-5xl glass-panel p-8 md:p-12 relative overflow-hidden backdrop-blur-2xl">
        {/* Background glow effects */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-500 via-purple-500 to-blue-500 opacity-50"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <header className="mb-12 text-center relative z-10">
          <div className="inline-flex items-center justify-center p-4 bg-gradient-to-br from-white/10 to-transparent rounded-2xl mb-6 shadow-inner border border-white/10">
            <Scissors className="w-10 h-10 text-cyan-300 drop-shadow-lg" />
          </div>
          <h1 className="text-5xl font-extralight tracking-tight text-white mb-2">
            Video<span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">Splitter</span> AI
          </h1>
          <p className="text-slate-400 font-light text-lg">Intelligent scene detection & processing</p>
        </header>

        <main className="space-y-8 relative z-10">
          {/* Input Section */}
          <div
            className={`p-8 rounded-2xl border-2 border-dashed transition-all duration-300 ${isDragging
              ? 'bg-cyan-500/10 border-cyan-400/50 scale-[1.01] shadow-xl shadow-cyan-900/20'
              : 'bg-black/20 border-white/10 hover:border-white/20 hover:bg-black/30'
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <label className="block text-sm font-medium text-slate-300 mb-4 flex justify-between uppercase tracking-wider text-xs">
              <span>Source Video</span>
              {isDragging && <span className="text-cyan-400 font-bold animate-pulse">Drop to Upload</span>}
            </label>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Video className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="Paste locally absolute path or drag & drop file..."
                  className="glass-input w-full pl-12 pr-4 py-3 rounded-xl text-lg font-light"
                />
              </div>
              <button
                onClick={() => handleAnalyze()}
                disabled={loading || !path}
                className="glass-button px-8 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              >
                {loading && !scenes.length ? <RefreshCw className="w-5 h-5 animate-spin" /> : null}
                Analyze Video
              </button>
              <button
                onClick={() => handleAnalyze(true)}
                disabled={loading || !path}
                className="glass-button px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg border border-cyan-500/30 hover:bg-cyan-500/20"
                title="Analyze and automatically split scenes"
              >
                <div className="flex flex-col items-center leading-none text-xs">
                  <span className="text-sm">Analyze</span>
                  <span className="opacity-70">& Split</span>
                </div>
              </button>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Upload className="w-4 h-4" />
              <span>Drag and drop anywhere in this box</span>
            </div>

            {/* Threshold Control */}
            <div className="bg-black/20 p-4 rounded-xl border border-white/5 backdrop-blur-sm flex items-center gap-4">
              <label className="text-sm font-medium text-slate-300 w-32">Sensitivity: {threshold.toFixed(1)}</label>
              <input
                type="range"
                min="5"
                max="95"
                step="0.5"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-xs text-slate-500">Lower = More Scenes</span>
            </div>
          </div>

          {/* Status / Error / Progress */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 flex items-center gap-3 backdrop-blur-md">
              <AlertCircle className="w-5 h-5 text-red-400" />
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between text-sm text-cyan-200 font-medium">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden border border-white/10 backdrop-blur-sm">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out shadow-[0_0_15px_rgba(34,211,238,0.5)] relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-400 font-mono mt-1">
                <span>{fps > 0 ? `${fps} FPS` : ''}</span>
                {detectedScenes > 0 && <span>Found {detectedScenes} scenes</span>}
                <span>{eta > 0 ? `${formatTime(eta)} remaining` : ''}</span>
              </div>
            </div>
          )}

          {!loading && status && !error && (
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-200 flex items-center gap-3 backdrop-blur-md animate-in fade-in">
              <CheckCircle className="w-5 h-5 text-cyan-400" />
              {status}
            </div>
          )}

          {!loading && status === 'Analysis complete.' && scenes.length === 0 && (
            <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-200 flex flex-col items-center gap-3 backdrop-blur-md animate-in fade-in">
              <AlertCircle className="w-8 h-8 text-yellow-400" />
              <div className="text-center">
                <p className="font-bold text-lg">No scenes detected</p>
                <p className="text-sm opacity-80">Try lowering the sensitivity threshold to detect subtler cuts.</p>
              </div>
            </div>
          )}

          {/* Results */}
          {scenes.length > 0 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <SceneList scenes={scenes} />

              <div className="flex justify-center pt-6 border-t border-white/5">
                <button
                  onClick={() => handleSplit()}
                  disabled={loading}
                  className="group relative px-10 py-4 bg-white text-black rounded-xl font-bold shadow-xl shadow-white/10 hover:shadow-cyan-500/20 transition-all transform hover:-translate-y-1 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-200 to-purple-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center gap-3 z-10">
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Scissors className="w-5 h-5" />}
                    Split Into {scenes.length} Scenes
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Split Results */}
          {splitResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl mt-8 backdrop-blur-sm animate-in fade-in zoom-in-95">
              <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <CheckCircle className="w-6 h-6" />
                Done!
              </h3>
              <p className="text-slate-300 mb-4 text-sm">Files saved to output directory:</p>
              <div className="max-h-40 overflow-y-auto custom-scrollbar bg-black/20 rounded-lg p-2">
                <ul className="space-y-1 text-xs text-emerald-200/80 font-mono">
                  {splitResult.map((f: string, i: number) => (
                    <li key={i} className="truncate">{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
