import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ChevronLeft, Send, Heart, Trash2, Edit3, Eye, Snowflake } from "lucide-react";
import { useNavigate } from "react-router";
import { MentionText } from "./MentionText";
import { soundEngine } from "../utils/soundEngine";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LoginModal } from "./LoginModal";
import { ImageLightbox } from "./ImageLightbox";
import { fetchComments, createComment, deleteComment, subscribeToNewComments, type CommentRecord } from "../data/comments";
import { deletePost, incrementPostViews } from "../data/posts";
import { createNotification } from "../data/notifications";
import { fetchLikeState, toggleLike } from "../data/likes";
import { freezePost, fetchMyPendingFreeze, fetchFreezeSuspensionStatus } from "../data/freezes";
import { recordEvent } from "../data/missions";
import { parseContentBlocks } from "../utils/postContent";
import { decodeImagePosition, objectPositionStyle } from "../utils/imagePosition";

interface PostType {
  id?: string;
  authorUserId?: string;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  comments: number;
  imageUrls?: string[];
  fontFamily?: string;
  views?: number;
  isMine?: boolean;
}

interface PostDetailViewProps {
  post: PostType;
  onBack: () => void;
  spaceName: string;
  nodePath?: string;
  onDeleted?: () => void;
}

export function PostDetailView({ post, onBack, spaceName, nodePath, onDeleted }: PostDetailViewProps) {
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const { userId, isAdmin } = useAuth();
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const closeFreezeModal = () => {
    setShowFreezeModal(false);
    try { window.dispatchEvent(new CustomEvent("oneu:bottom-modal", { detail: { open: false } })); } catch (_) {}
  };
  // 프리즈 창을 열어둔 채로 이 화면을 벗어나면(다른 탭 누르기, 뒤로가기 등) 위 함수가
  // 한 번도 안 불리고 컴포넌트가 그냥 사라져서, "닫힘" 신호가 안 가 튜토리얼 카드가
  // 영영 숨겨진 채로 남는 문제가 있었다 — 언마운트될 때 안전하게 한 번 더 닫아준다.
  useEffect(() => {
    return () => {
      try { window.dispatchEvent(new CustomEvent("oneu:bottom-modal", { detail: { open: false } })); } catch (_) {}
    };
  }, []);
  const [freezeReason, setFreezeReason] = useState("");
  const [isFreezing, setIsFreezing] = useState(false);
  const [hasPendingFreeze, setHasPendingFreeze] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [suspendedUntil, setSuspendedUntil] = useState<Date | null>(null);

  const [displayViews, setDisplayViews] = useState(post.views ?? 0);

  useEffect(() => {
    if (!post.id) return;
    let cancelled = false;
    void incrementPostViews(post.id);
    setDisplayViews((v) => v + 1);
    void fetchComments(post.id).then((data) => {
      if (!cancelled) setComments(data);
    });
    void fetchLikeState(post.id).then(({ count, likedByMe }) => {
      if (!cancelled) {
        setLikeCount(count);
        setLikedByMe(likedByMe);
      }
    });

    // 다른 사람이 이 글에 댓글을 달면 새로고침 없이 바로 보인다.
    // 내 댓글은 이미 낙관적 업데이트로 반영되므로 여기선 남의 댓글만 추가한다.
    const unsubscribe = subscribeToNewComments(post.id, (comment) => {
      if (comment.isMine) return;
      setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [post.id]);

  // 프리즈 대기/정지 상태 확인 — post.id뿐 아니라 userId가 바뀔 때도(로그인 상태가
  // 이 글을 보고 있는 동안 늦게 확정되는 경우 포함) 다시 확인해야 해서 별도 effect로 뺐다.
  useEffect(() => {
    if (!post.id || !userId) { setHasPendingFreeze(false); setSuspendedUntil(null); return; }
    let cancelled = false;
    void fetchMyPendingFreeze().then((pending) => { if (!cancelled) setHasPendingFreeze(pending); });
    void fetchFreezeSuspensionStatus().then((status) => {
      if (!cancelled) setSuspendedUntil(status.suspended ? status.until ?? null : null);
    });
    return () => { cancelled = true; };
  }, [post.id, userId]);

  const handleBack = () => {
    soundEngine.playSwoosh();
    onBack();
  };

  const handleEdit = () => {
    if (!post.id) return;
    soundEngine.playClick();
    navigate("/create-post", {
      state: {
        returnPath: nodePath ? `/space/${nodePath}` : undefined,
        spaceName,
        editPostId: post.id,
        editTitle: post.title,
        editContent: post.content,
        editImageUrls: post.imageUrls,
      },
    });
  };

  const handleDeletePost = async () => {
    if (!post.id) return;
    if (!window.confirm("이 글을 삭제할까요?\n댓글과 공감도 함께 사라지고, 되돌릴 수 없어요.")) return;
    const ok = await deletePost(post.id, post.imageUrls);
    if (ok) {
      soundEngine.playClick();
      onDeleted?.();
      onBack();
    } else {
      alert("글 삭제에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    const ok = await deleteComment(commentId);
    if (ok) {
      soundEngine.playClick();
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } else {
      alert("댓글 삭제에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!post.id) {
      alert("이 글은 아직 공감할 수 없어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (!userId) {
      setShowLogin(true);
      return;
    }
    soundEngine.playClick();
    const nextLiked = !likedByMe;
    setLikedByMe(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));

    const ok = await toggleLike(post.id, likedByMe);
    if (!ok) {
      setLikedByMe(!nextLiked);
      setLikeCount((c) => c - (nextLiked ? 1 : -1));
      alert("공감 처리에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (nextLiked) recordEvent("give-like");
    if (nextLiked && post.authorUserId) {
      void createNotification({
        targetUserId: post.authorUserId,
        type: "save",
        message: `내 글 "${post.title}"에 공감했어요`,
        postId: post.id,
        nodePath,
      });
    }
  };

  const handleSubmitFreeze = async () => {
    if (!post.id) return;
    if (!userId) {
      setShowLogin(true);
      return;
    }
    const reason = freezeReason.trim();
    if (!reason) {
      alert("프리즈 사유를 입력해주세요.");
      return;
    }
    setIsFreezing(true);
    const result = await freezePost(post.id, reason);
    setIsFreezing(false);
    if (!result.ok) {
      alert(result.error ?? "프리즈에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    try { soundEngine.playClick(); } catch (_) {}
    closeFreezeModal();
    setFreezeReason("");
    setHasPendingFreeze(true);
    if (post.authorUserId) {
      void createNotification({
        targetUserId: post.authorUserId,
        type: "freeze",
        message: `내 글 "${post.title}"이(가) 프리즈됐어요. 관리자가 검토할 때까지 잠시 안 보여요.`,
        nodePath,
      });
    }
    alert("프리즈했어요. 관리자 검토 후 결과가 반영됩니다.");
  };

  const handleSubmitComment = async () => {
    if (!comment.trim() || isPosting || !post.id) return;
    if (!userId) {
      setShowLogin(true);
      return;
    }
    setIsPosting(true);
    soundEngine.playClick();
    const text = comment.trim();
    const result = await createComment(post.id, text);
    setIsPosting(false);
    if (result.ok) {
      recordEvent("write-comment");
      setComment("");
      // 방금 단 댓글을 바로 화면에 보여준다(다시 불러오지 않고 그 자리에 추가)
      setComments((prev) => [...prev, { id: result.id ?? `local-${Date.now()}`, authorName: "나", content: text, timestamp: "방금", isMine: true }]);
      if (post.authorUserId) {
        void createNotification({
          targetUserId: post.authorUserId,
          type: "comment",
          message: `내 글 "${post.title}"에 댓글이 달렸어요: "${text.slice(0, 40)}"`,
          postId: post.id,
          nodePath,
        });
      }
    } else {
      alert(result.error ?? "댓글 저장에 실패했어요. 로그인 상태를 확인해주세요.");
    }
  };

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-50 bg-background flex flex-col"
    >
      {/* Header */}
      <div className="sticky top-0 bg-background/90 backdrop-blur-xl border-b border-border z-30">
        <div className="px-4 sm:px-6 py-4 sm:py-5 max-w-2xl mx-auto flex items-center justify-between">
          <motion.button
            onClick={handleBack}
            className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
            {spaceName} 게시판
          </motion.button>

          {post.id && (post.isMine || isAdmin) && (
            <div className="flex items-center gap-4">
              {post.isMine && (
                <motion.button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 text-[12px] sm:text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                  whileTap={{ scale: 0.95 }}
                >
                  <Edit3 size={14} strokeWidth={1.5} />
                  수정
                </motion.button>
              )}
              <motion.button
                onClick={() => void handleDeletePost()}
                className="flex items-center gap-1.5 text-[12px] sm:text-[13px] transition-colors"
                style={{ color: "var(--destructive)" }}
                whileTap={{ scale: 0.95 }}
              >
                <Trash2 size={15} strokeWidth={1.5} />
                {post.isMine ? "삭제" : "삭제(관리자)"}
              </motion.button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Post Header */}
          <div className="mb-6 sm:mb-8">
            <h1
              className="text-[18px] sm:text-[22px] font-medium tracking-wide text-foreground mb-4 leading-snug"
              style={post.fontFamily ? { fontFamily: post.fontFamily } : undefined}
            >
              {post.title}
            </h1>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary/50 flex items-center justify-center border border-border">
                  <span className="text-[12px] sm:text-[14px] opacity-70">👤</span>
                </div>
                <div className="flex flex-col">
                  <p className="text-[12px] sm:text-[13px] font-medium tracking-wide text-foreground">{post.author}</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-widest">{post.timestamp}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Post Content — 사진과 글이 사용자가 배치한 순서 그대로 섞여서 나온다 */}
          <div className="bg-card/60 backdrop-blur-md rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-border shadow-[0_4px_20px_rgb(0,0,0,0.02)] mb-6 sm:mb-8">
            {parseContentBlocks(post.content, post.imageUrls ?? []).map((block, i) =>
              block.type === "image" ? (
                <img
                  key={i}
                  src={decodeImagePosition(block.url).src}
                  alt=""
                  style={{ objectPosition: objectPositionStyle(block.url), cursor: "pointer" }}
                  className="w-full max-h-[420px] object-cover rounded-2xl mb-4"
                  onClick={() => setLightboxUrl(decodeImagePosition(block.url).src)}
                />
              ) : (
                <MentionText
                  key={i}
                  text={block.value}
                  style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.65, whiteSpace: "pre-wrap", letterSpacing: "0.02em", display: "block", marginBottom: 12, ...(post.fontFamily ? { fontFamily: post.fontFamily } : {}) }}
                  className="text-foreground"
                />
              )
            )}

            <div className="flex items-center gap-4 mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-border">
              <button
                onClick={(e) => void handleToggleLike(e)}
                className="flex items-center gap-1.5 text-[11px] sm:text-[12px] transition-colors"
                style={{ color: likedByMe ? "#C2694A" : "var(--muted-foreground)" }}
              >
                <Heart size={14} strokeWidth={1.5} fill={likedByMe ? "#C2694A" : "none"} />
                <span>공감 {likeCount}</span>
              </button>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-muted-foreground">
                <MessageCircle size={14} sm:size={16} strokeWidth={1.5} />
                <span>댓글 {comments.length}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-muted-foreground">
                <Eye size={14} strokeWidth={1.5} />
                <span>조회 {displayViews}</span>
              </div>
              {!post.isMine && (
                <button
                  onClick={() => {
                    if (!userId) { setShowLogin(true); return; }
                    if (hasPendingFreeze) { alert("이미 처리 대기 중인 프리즈가 있어요. 결과가 나올 때까지 기다려주세요."); return; }
                    if (suspendedUntil) {
                      const until = suspendedUntil.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
                      alert(`잘못된 프리즈가 쌓여서 ${until}까지 프리즈 기능을 쓸 수 없어요.`);
                      return;
                    }
                    try { soundEngine.playClick(); } catch (_) {}
                    setShowFreezeModal(true);
                    recordEvent("open-freeze-info");
                    try { window.dispatchEvent(new CustomEvent("oneu:bottom-modal", { detail: { open: true } })); } catch (_) {}
                  }}
                  className="flex items-center gap-1.5 text-[11px] sm:text-[12px] transition-colors ml-auto"
                  style={{ color: "var(--muted-foreground)", opacity: hasPendingFreeze || suspendedUntil ? 0.5 : 1 }}
                >
                  <Snowflake size={13} strokeWidth={1.5} />
                  <span>프리즈</span>
                </button>
              )}
            </div>
          </div>

          {/* Comments Section */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4 sm:mb-5 pl-1">댓글</p>
            {comments.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-[12px] sm:text-[13px] text-muted-foreground font-light bg-card rounded-2xl border border-border">
                {post.id ? "첫 번째 댓글을 남겨보세요." : "이 글에는 댓글을 남길 수 없어요."}
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3 sm:gap-4">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-secondary/30 flex-shrink-0 flex items-center justify-center border border-border">
                      <span className="text-[10px] opacity-50">👤</span>
                    </div>
                    <div className="flex-1 bg-card/40 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-border">
                      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <span className="text-[11px] sm:text-[12px] font-medium text-foreground">{c.authorName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{c.timestamp}</span>
                          {(c.isMine || isAdmin) && (
                            <button
                              onClick={() => void handleDeleteComment(c.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                              title={c.isMine ? "댓글 삭제" : "댓글 삭제(관리자)"}
                            >
                              <Trash2 size={11} strokeWidth={1.5} className="text-muted-foreground" style={{ opacity: 0.45 }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <MentionText
                        text={c.content}
                        style={{ fontSize: 12.5, fontWeight: 300, lineHeight: 1.6, letterSpacing: "0.02em", whiteSpace: "pre-wrap", display: "block" }}
                        className="text-foreground"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="h-28 sm:h-32" />
        </div>
      </div>

      {/* Comment Input */}
      {post.id && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pt-4 bg-gradient-to-t from-background via-background/95 to-transparent z-[55]"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-2xl mx-auto flex items-center gap-2 sm:gap-3">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSubmitComment()}
              placeholder="댓글을 남겨주세요..."
              className="flex-1 px-4 sm:px-5 py-3 sm:py-3.5 bg-card/80 backdrop-blur-md rounded-full border border-border focus:outline-none focus:border-accent transition-colors text-[16px] sm:text-[13px] text-foreground placeholder:text-muted-foreground/60 shadow-[0_4px_20px_rgb(0,0,0,0.02)]"
            />
            <motion.button
              onClick={() => void handleSubmitComment()}
              disabled={!comment.trim() || isPosting}
              className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 bg-primary text-primary-foreground rounded-full flex items-center justify-center disabled:opacity-40 shadow-[0_4px_14px_rgb(0,0,0,0.1)] transition-opacity"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Send size={16} strokeWidth={1.5} />
            </motion.button>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <AnimatePresence>
        {showFreezeModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeFreezeModal}
              className="fixed inset-0 z-[100]"
              style={{ backgroundColor: "rgba(44,36,32,0.3)", backdropFilter: "blur(4px)" }}
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed left-1/2 -translate-x-1/2 w-full max-w-sm z-[101]"
              style={{ bottom: 24, paddingLeft: 16, paddingRight: 16 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-3xl overflow-hidden p-6"
                style={{ backgroundColor: "var(--card)", border: "1px solid rgba(44,36,32,0.08)", boxShadow: "0 24px 60px rgba(44,36,32,0.18)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Snowflake size={16} strokeWidth={1.6} style={{ color: "#5A8B9B" }} />
                  <p className="text-foreground font-medium" style={{ fontSize: 15 }}>이 글을 프리즈할까요?</p>
                </div>
                <p className="text-muted-foreground mb-4" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  프리즈하면 관리자가 검토할 때까지 이 글이 잠시 안 보여요. 신고가 부정확했다고 판단되면 프리즈 기능이 일정 기간 정지돼요(반복되면 정지 기간이 늘어나요).
                </p>
                <textarea
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  placeholder="프리즈 사유를 적어주세요"
                  rows={3}
                  autoFocus
                  style={{
                    width: "100%", resize: "none", borderRadius: 14, padding: "10px 12px",
                    fontSize: 13, backgroundColor: "var(--secondary)", border: "1px solid rgba(44,36,32,0.08)",
                    color: "var(--foreground)", outline: "none",
                  }}
                />
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => { closeFreezeModal(); setFreezeReason(""); }}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium"
                    style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                  >
                    취소
                  </button>
                  <button
                    onClick={() => void handleSubmitFreeze()}
                    disabled={isFreezing || !freezeReason.trim()}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium"
                    style={{ backgroundColor: "#2C2420", color: "#FAF8F5", opacity: isFreezing || !freezeReason.trim() ? 0.5 : 1 }}
                  >
                    {isFreezing ? "처리 중..." : "프리즈하기"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
