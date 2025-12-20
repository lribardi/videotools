import React from 'react';
import type { Scene } from '../types';
import { Film, Link as LinkIcon, Unlink } from 'lucide-react';

interface SceneListProps {
    scenes: Scene[];
    videoPath: string;
    onPlayScene: (scene: Scene) => void;
    links: Set<number>;
    onToggleLink: (index: number) => void;
}

export const SceneList: React.FC<SceneListProps> = ({ scenes, videoPath, onPlayScene, links, onToggleLink }) => {
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
                        {scenes.map((scene, index) => {
                            const isLinkedToNext = links.has(index);
                            const isLinkedToPrev = index > 0 && links.has(index - 1);
                            const isLinked = isLinkedToNext || isLinkedToPrev;

                            return (
                                <div key={scene.scene_number} className="relative group/card">
                                    <div
                                        onClick={() => onPlayScene(scene)}
                                        className={`
                                            group relative aspect-square bg-black/40 rounded-xl overflow-hidden border transition-all cursor-pointer
                                            ${isLinked
                                                ? 'border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                                                : 'border-white/5 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                                            }
                                        `}
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
                                                    <span className={`text-xs font-bold block mb-0.5 ${isLinked ? 'text-cyan-400' : 'text-cyan-300'}`}>
                                                        Scene {scene.scene_number}
                                                        {isLinked && <span className="ml-1 text-[9px] px-1 bg-cyan-500/20 rounded">LINKED</span>}
                                                    </span>
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

                                    {/* Link Button (Only if not last scene) */}
                                    {index < scenes.length - 1 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleLink(index);
                                            }}
                                            className={`
                                                absolute -right-5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all
                                                ${isLinkedToNext
                                                    ? 'bg-cyan-500 text-white hover:bg-cyan-400 scale-110'
                                                    : 'bg-black/60 text-slate-400 hover:bg-white hover:text-black border border-white/10'
                                                }
                                            `}
                                            title={isLinkedToNext ? "Unlink from next" : "Link with next"}
                                        >
                                            {isLinkedToNext ? <Unlink className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                                        </button>
                                    )}

                                    {/* Visual Connector Line */}
                                    {isLinkedToNext && (
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-[2px] bg-cyan-500 z-10 translate-x-2"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
