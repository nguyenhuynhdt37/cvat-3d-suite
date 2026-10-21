import { TrackStudioModal } from "./TrackStudioModal";

/**
 * TrackEditorModal (Legacy Alias)
 * Chuyển hướng hoàn toàn sang TrackStudioModal (Active Track Retime Studio).
 * Triệt tiêu 100% mọi lỗi liên quan đến Canvas 2D unproject và 'boxCorners is not defined'.
 */
export class TrackEditorModal extends TrackStudioModal {}
