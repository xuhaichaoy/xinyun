//! 游戏核心逻辑模块（状态机、规则引擎等）。

pub mod effects;
pub mod rules;
pub mod state;

pub use effects::{
    EffectCondition,
    EffectContext,
    EffectEngine,
    EffectKind,
    EffectResolution,
    EffectStack,
    EffectTarget,
    EffectTrigger,
};
pub use state::{
    Card,
    CardEffect,
    CardId,
    CardType,
    GameEvent,
    GamePhase,
    GameState,
    IntegrityError,
    Player,
    PlayerId,
    VictoryReason,
    VictoryState,
};
pub use rules::{AttackAction, PlayCardAction, RuleEngine, RuleError, RuleResolution};
