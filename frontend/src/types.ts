export interface Scene {
    start: number;
    end: number;
    scene_number: number;
}

export interface AnalysisResponse {
    video_path: string;
    scenes: Scene[];
}
