import React from 'react';
import type { Scene } from '../types';
import { Film } from 'lucide-react';

interface SceneListProps {
    scenes: Scene[];
}

export const SceneList: React.FC<SceneListProps> = ({ scenes }) => {
    if (scenes.length === 0) return null;

    return (
        <div className="mt-8">
            <h2 className="text-xl font-light mb-4 flex items-center gap-3 text-cyan-100">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Film className="w-5 h-5 text-cyan-400" />
                </div>
                Detected Scenes <span className="text-sm px-2 py-0.5 bg-white/5 rounded-full text-slate-400 border border-white/5">{scenes.length}</span>
            </h2>
            <div className="glass-panel overflow-hidden border-white/5">
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-black/20 sticky top-0 backdrop-blur-md z-10">
                            <tr>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">#</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">Start</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">End</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {scenes.map((scene) => (
                                <tr key={scene.scene_number} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4 text-slate-300 font-medium group-hover:text-cyan-200">Scene {scene.scene_number}</td>
                                    <td className="p-4 font-mono text-cyan-300/80 text-sm">{scene.start.toFixed(2)}s</td>
                                    <td className="p-4 font-mono text-purple-300/80 text-sm">{scene.end.toFixed(2)}s</td>
                                    <td className="p-4 font-mono text-slate-400 text-sm">{(scene.end - scene.start).toFixed(2)}s</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
