//! AI 算法模块（如 MCTS、启发式策略等）。

pub mod minimax;

pub use minimax::{AiAgent, AiConfig, AiDecision, AiDifficulty, AiStrategy, GameAction};
