import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Volume2, VolumeX, HelpCircle, LogOut, LogIn, UserX, TriangleAlert, Bell, BellOff, ChevronDown, Snowflake, Link2 } from "lucide-react";
import { deleteMyAccount } from "../data/accountDeletion";
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from "../data/pushNotifications";
import { soundEngine } from "../utils/soundEngine";
import { useAuth } from "../contexts/AuthContext";
import { FreezeReviewModal } from "./FreezeReviewModal";
const NodeGraphAdminModal = lazy(() => import("./NodeGraphAdminModal").then((m) => ({ default: m.NodeGraphAdminModal })));

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTutorial: () => void;
  onRequestLogin: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenTutorial, onRequestLogin }: SettingsModalProps) {
  const { email, signOut, isAdmin } = useAuth();
  const [isMuted, setIsMuted] = useState(soundEngine.isMuted);
  const [volume, setVolume] = useState(soundEngine.masterVolume);
  // 팁이 하나씩 카드로 쌓이다 보니 도움말 화면이 너무 길고 부담스러워 보여서,
  // 한 번에 하나만 펼쳐지는 아코디언으로 정리했다 — 첫인상은 "제목 4줄"뿐이라 가볍다.
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [showFreezeReview, setShowFreezeReview] = useState(false);
  const [showNodeGraph, setShowNodeGraph] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setWithdrawError(null);
    const result = await deleteMyAccount();
    setWithdrawing(false);
    if (result.success) {
      setShowWithdrawConfirm(false);
      onClose();
    } else {
      setWithdrawError(result.error ?? "탈퇴에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };
  const [pushOn, setPushOn] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) void isPushSubscribed().then(setPushOn);
  }, [isOpen]);

  const handleTogglePush = async () => {
    setPushError(null);
    setPushLoading(true);
    if (pushOn) {
      await unsubscribeFromPush();
      setPushOn(false);
    } else {
      const result = await subscribeToPush();
      if (result.success) {
        setPushOn(true);
      } else {
        setPushError(result.error ?? "알림 설정에 실패했어요.");
      }
    }
    setPushLoading(false);
  };

  const handleToggleMute = () => {
    try { soundEngine.playClick(); } catch (_) {}
    setIsMuted(soundEngine.toggleMute());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(44,36,32,0.4)", zIndex: 200 }}
          />
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            style={{
              position: "fixed", left: 0, right: 0, margin: "0 auto", bottom: 0,
              width: "100%", maxWidth: 480, height: "min(560px, 84dvh)", maxHeight: "84dvh",
              background: "#FAF8F5", borderTopLeftRadius: 22, borderTopRightRadius: 22,
              zIndex: 201, boxShadow: "0 -8px 28px rgba(44,36,32,0.14)",
              display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 14px", flexShrink: 0, borderBottom: "1px solid rgba(44,36,32,0.06)" }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: "#2C2420" }}>설정</p>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                <X size={18} color="#6B6158" />
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px calc(24px + env(safe-area-inset-bottom))" }}>
              {/* 소리 */}
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#9B7A5A", marginBottom: 10 }}>소리</p>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                border: "1px solid rgba(44,36,32,0.06)", marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {isMuted ? <VolumeX size={17} strokeWidth={1.6} color="#6B6158" /> : <Volume2 size={17} strokeWidth={1.6} color="#2C2420" />}
                  <span style={{ fontSize: 13, color: "#2C2420" }}>배경음악·효과음</span>
                </div>
                <button
                  onClick={handleToggleMute}
                  role="switch"
                  aria-checked={!isMuted}
                  style={{
                    width: 42, height: 25, borderRadius: 99, border: "none", cursor: "pointer",
                    backgroundColor: isMuted ? "rgba(44,36,32,0.15)" : "#2C2420",
                    position: "relative", transition: "background-color 0.2s", flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: isMuted ? 3 : 20, width: 19, height: 19,
                    borderRadius: 99, backgroundColor: "#FAF8F5", transition: "left 0.2s",
                  }} />
                </button>
              </div>

              {!isMuted && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                  border: "1px solid rgba(44,36,32,0.06)", marginBottom: 8,
                }}>
                  <VolumeX size={13} strokeWidth={1.6} color="#6B6158" style={{ flexShrink: 0, opacity: 0.6 }} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(e) => {
                      const level = Number(e.target.value) / 100;
                      setVolume(level);
                      soundEngine.setVolume(level);
                    }}
                    style={{ flex: 1, accentColor: "#2C2420", cursor: "pointer" }}
                  />
                  <Volume2 size={15} strokeWidth={1.6} color="#2C2420" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#6B6158", width: 28, textAlign: "right", flexShrink: 0 }}>
                    {Math.round(volume * 100)}
                  </span>
                </div>
              )}

              <p style={{ fontSize: 11, color: "#6B6158", opacity: 0.7, marginBottom: 20, padding: "0 2px" }}>
                아이템가방에서 음악을 직접 고를 수도 있고, 안 골랐다면 지금 장착 중인 테마에 어울리는 음악이 자동으로 나와요.
              </p>

              {/* 알림 */}
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#9B7A5A", marginBottom: 10, marginTop: 20 }}>알림</p>
              {isPushSupported() ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                  border: "1px solid rgba(44,36,32,0.06)", marginBottom: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {pushOn ? <Bell size={17} strokeWidth={1.6} color="#2C2420" /> : <BellOff size={17} strokeWidth={1.6} color="#6B6158" />}
                    <span style={{ fontSize: 13, color: "#2C2420" }}>새 댓글·공감 푸시 알림</span>
                  </div>
                  <button
                    onClick={() => void handleTogglePush()}
                    disabled={pushLoading}
                    role="switch"
                    aria-checked={pushOn}
                    style={{
                      width: 42, height: 25, borderRadius: 99, border: "none", cursor: pushLoading ? "default" : "pointer",
                      backgroundColor: pushOn ? "#2C2420" : "rgba(44,36,32,0.15)",
                      position: "relative", transition: "background-color 0.2s", flexShrink: 0,
                      opacity: pushLoading ? 0.6 : 1,
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 3, left: pushOn ? 20 : 3, width: 19, height: 19,
                      borderRadius: 99, backgroundColor: "#FAF8F5", transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 11.5, color: "#6B6158", opacity: 0.7, marginBottom: 8, padding: "0 2px" }}>
                  이 브라우저에서는 푸시 알림을 지원하지 않아요.
                </p>
              )}
              {pushError && (
                <p style={{ fontSize: 11, color: "var(--destructive)", marginBottom: 8, padding: "0 2px" }}>{pushError}</p>
              )}

              {/* 도움말 */}
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#9B7A5A", marginBottom: 10 }}>도움말</p>
              <button
                onClick={() => { onClose(); onOpenTutorial(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  padding: "12px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                  border: "1px solid rgba(44,36,32,0.06)", cursor: "pointer", marginBottom: 20,
                }}
              >
                <HelpCircle size={17} strokeWidth={1.6} color="#2C2420" />
                <span style={{ fontSize: 13, color: "#2C2420" }}>오느 안내 다시 보기</span>
              </button>

              {(() => {
                const TIP_SECTIONS: { key: string; title: string; items: React.ReactNode[] }[] = [
                  {
                    key: "write", title: "글쓰기 팁", items: [
                      <><span style={{ color: "#2C2420" }}>[사진1]</span>처럼 적으면 그 자리에 사진이 들어가요</>,
                      <><span style={{ color: "#2C2420" }}>@관심사</span>를 적으면 그 커뮤니티로 연결돼요</>,
                      <><span style={{ color: "#2C2420" }}>!관심사</span>를 적으면 내 마이맵으로 연결돼요</>,
                    ],
                  },
                  {
                    key: "map", title: "지도 사용 팁", items: [
                      <>관심사를 <span style={{ color: "#2C2420" }}>길게 누른 채로 드래그</span>하면 원하는 위치로 옮길 수 있어요</>,
                      <>컴퓨터에서는 <span style={{ color: "#2C2420" }}>Ctrl(맥은 Cmd)을 누른 채로 드래그</span>해도 돼요</>,
                      <>옮긴 위치는 이 기기에 저장돼서, 다음에 들어와도 그대로예요</>,
                    ],
                  },
                  {
                    key: "mymap", title: "마이맵 사용 팁", items: [
                      <>노드를 이어주는 <span style={{ color: "#2C2420" }}>선을 누르면</span> 그 사이에 새 노드를 끼워넣을 수 있어요</>,
                    ],
                  },
                  {
                    key: "items", title: "아이템가방 사용 팁", items: [
                      <>"새로운 목적지"처럼 누르면 바로 실행되는 아이템은, <span style={{ color: "#2C2420" }}>길게 누르면(컴퓨터는 Ctrl/Cmd+클릭)</span> 삭제할 수 있어요</>,
                    ],
                  },
                ];
                return (
                  <div style={{
                    borderRadius: 14, backgroundColor: "#F0EAE0",
                    border: "1px solid rgba(44,36,32,0.06)", marginBottom: 20, overflow: "hidden",
                  }}>
                    {TIP_SECTIONS.map((section, i) => {
                      const isOpen = expandedTip === section.key;
                      return (
                        <div key={section.key} style={{ borderTop: i > 0 ? "1px solid rgba(44,36,32,0.06)" : "none" }}>
                          <button
                            onClick={() => { try { soundEngine.playClick(); } catch (_) {} setExpandedTip(isOpen ? null : section.key); }}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                              padding: "12px 14px", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation",
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#2C2420" }}>{section.title}</span>
                            <ChevronDown
                              size={14} strokeWidth={1.8} color="#9B7A5A"
                              style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                            />
                          </button>
                          {isOpen && (
                            <ul style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "#6B6158", lineHeight: 1.6, padding: "0 14px 14px" }}>
                              {section.items.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 계정 */}
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#9B7A5A", marginBottom: 10 }}>계정</p>
              {isAdmin && (
                <button
                  onClick={() => { try { soundEngine.playClick(); } catch (_) {} setShowFreezeReview(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: 14, backgroundColor: "rgba(90,139,155,0.1)",
                    border: "1px solid rgba(90,139,155,0.2)", cursor: "pointer", marginBottom: 10,
                  }}
                >
                  <Snowflake size={17} strokeWidth={1.6} style={{ color: "#5A8B9B" }} />
                  <span style={{ fontSize: 13, color: "#5A8B9B" }}>관리자: 프리즈 검토</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => { try { soundEngine.playClick(); } catch (_) {} setShowNodeGraph(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: 14, backgroundColor: "rgba(90,139,155,0.1)",
                    border: "1px solid rgba(90,139,155,0.2)", cursor: "pointer", marginBottom: 10,
                  }}
                >
                  <Link2 size={17} strokeWidth={1.6} style={{ color: "#5A8B9B" }} />
                  <span style={{ fontSize: 13, color: "#5A8B9B" }}>관리자: 노드 관리</span>
                </button>
              )}
              {email ? (
                <div>
                  <p style={{ fontSize: 12, color: "#6B6158", marginBottom: 10, padding: "0 2px" }}>{email}</p>
                  <button
                    onClick={() => { onClose(); void signOut(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "12px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                      border: "1px solid rgba(44,36,32,0.06)", cursor: "pointer", marginBottom: 8,
                    }}
                  >
                    <LogOut size={17} strokeWidth={1.6} style={{ color: "var(--destructive)" }} />
                    <span style={{ fontSize: 13, color: "var(--destructive)" }}>로그아웃</span>
                  </button>
                  <button
                    onClick={() => setShowWithdrawConfirm(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
                    }}
                  >
                    <UserX size={14} strokeWidth={1.6} color="#6B6158" style={{ opacity: 0.55 }} />
                    <span style={{ fontSize: 12, color: "#6B6158", opacity: 0.55 }}>회원 탈퇴</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { onClose(); onRequestLogin(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: 14, backgroundColor: "#F0EAE0",
                    border: "1px solid rgba(44,36,32,0.06)", cursor: "pointer",
                  }}
                >
                  <LogIn size={17} strokeWidth={1.6} color="#2C2420" />
                  <span style={{ fontSize: 13, color: "#2C2420" }}>로그인</span>
                </button>
              )}
            </div>
          </motion.div>

          {/* 회원 탈퇴 확인 */}
          <AnimatePresence>
            {showWithdrawConfirm && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => !withdrawing && setShowWithdrawConfirm(false)}
                  style={{ position: "fixed", inset: 0, background: "rgba(44,36,32,0.5)", zIndex: 210 }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  style={{
                    position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                    width: "min(340px, calc(100vw - 48px))", background: "#FAF8F5", borderRadius: 20,
                    zIndex: 211, boxShadow: "0 12px 32px rgba(44,36,32,0.2)", padding: "24px 22px",
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(212,24,61,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                  }}>
                    <TriangleAlert size={20} strokeWidth={1.8} style={{ color: "var(--destructive)" }} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#2C2420", marginBottom: 10 }}>정말 탈퇴하시겠어요?</p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#6B6158", marginBottom: 18 }}>
                    작성한 글, 댓글, 마이맵, 미션 진행 상황을 포함한 모든 데이터가 삭제되고<br />
                    <strong style={{ color: "#2C2420" }}>되돌릴 수 없어요.</strong>
                  </p>
                  {withdrawError && (
                    <p style={{ fontSize: 11.5, color: "var(--destructive)", marginBottom: 14 }}>{withdrawError}</p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setShowWithdrawConfirm(false)}
                      disabled={withdrawing}
                      style={{
                        flex: 1, padding: "12px", borderRadius: 999, border: "none",
                        backgroundColor: "#F0EAE0", color: "#2C2420", fontSize: 13, cursor: "pointer",
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={() => void handleWithdraw()}
                      disabled={withdrawing}
                      style={{
                        flex: 1, padding: "12px", borderRadius: 999, border: "none",
                        backgroundColor: "var(--destructive)", color: "#FFFFFF", fontSize: 13, fontWeight: 500,
                        cursor: "pointer", opacity: withdrawing ? 0.6 : 1,
                      }}
                    >
                      {withdrawing ? "탈퇴 중..." : "탈퇴하기"}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}

      <FreezeReviewModal isOpen={showFreezeReview} onClose={() => setShowFreezeReview(false)} />
      {showNodeGraph && (
        <Suspense fallback={null}>
          <NodeGraphAdminModal isOpen={showNodeGraph} onClose={() => setShowNodeGraph(false)} />
        </Suspense>
      )}
    </AnimatePresence>
  );
}
