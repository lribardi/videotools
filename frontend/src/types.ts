export interface Scene {
    start: number;
    end: number;
    scene_number: number;
    group_id?: number;
}

export interface AnalysisResponse {
    video_path: string;
    scenes: Scene[];
}
