import React from 'react';
import type { Scene } from '../types';
import { Film } from 'lucide-react';

interface SceneListProps {
    scenes: Scene[];
    videoPath: string;
    onPlayScene: (scene: Scene) => void;
}

export const SceneList: React.FC<SceneListProps> = ({ scenes, videoPath, onPlayScene }) => {
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
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                        {scenes.map((scene) => (
                            <div
                                key={scene.scene_number}
                                onClick={() => onPlayScene(scene)}
                                className="group relative aspect-square bg-black/40 rounded-xl overflow-hidden border border-white/5 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all cursor-pointer"
                            >
                                {/* Thumbnail */}
                                <img
                                    src={`/api/thumbnail?path=${encodeURIComponent(videoPath)}&time=${scene.start}`}
                                    alt={`Scene ${scene.scene_number}`}
                                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                                    loading="lazy"
                                />

                                {/* Overlay Info */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 flex flex-col justify-end">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <span className="text-xs font-bold text-cyan-300 block mb-0.5">Scene {scene.scene_number}</span>
                                            <span className="text-[10px] text-slate-400 font-mono block">
                                                {scene.start.toFixed(1)}s - {scene.end.toFixed(1)}s
                                            </span>
                                        </div>
                                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-slate-300 backdrop-blur-sm">
                                            {(scene.end - scene.start).toFixed(1)}s
                                        </span>
                                    </div>
                                </div>

                                {/* Play Icon Overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20 backdrop-blur-[1px]">
                                    <div className="w-10 h-10 rounded-full bg-cyan-500/90 flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                                        <div className="w-0 h-0 border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-1"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
