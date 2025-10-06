pub mod ai;
pub mod game;
pub mod utils;

use gloo_timers::future::TimeoutFuture;
use serde::Serialize;
use serde_json;
use serde_wasm_bindgen::{from_value, to_value};
use std::str::FromStr;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;
use web_sys::js_sys::Promise;

pub use ai::{AiAgent, AiConfig, AiDecision, AiDifficulty, AiStrategy, GameAction};
pub use game::{
    AttackAction, Card, CardEffect, CardId, CardType, EffectCondition, EffectContext, EffectEngine,
    EffectKind, EffectResolution, EffectStack, EffectTarget, EffectTrigger, GameEvent, GamePhase,
    GameState, IntegrityError, MulliganAction, PlayCardAction, Player, PlayerId, RuleEngine, RuleError,
    RuleResolution, VictoryReason, VictoryState,
};

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn start() {
    set_panic_hook();
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    let message = format!("你好，{name}! 欢迎使用 Rust + WebAssembly。");
    web_sys::console::log_1(&message.clone().into());
    message
}

fn make_resolution(state: GameState, events: Vec<GameEvent>) -> RuleResolution {
    RuleResolution::new(state, events)
}

fn to_js_error(error: RuleError) -> JsValue {
    to_value(&error).unwrap_or_else(|serialize_err| JsValue::from_str(&serialize_err.to_string()))
}

fn serde_to_js_error<E: std::fmt::Display>(error: E) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn make_resolution_json(resolution: RuleResolution) -> Result<String, JsValue> {
    serde_json::to_string(&resolution).map_err(serde_to_js_error)
}

fn resolution_from_events(state: &GameState, events: Vec<GameEvent>) -> RuleResolution {
    RuleResolution::new(state.clone(), events)
}

fn execute_with_engine<F>(state: &mut GameState, action: F) -> Result<Vec<GameEvent>, JsValue>
where
    F: FnOnce(&mut RuleEngine, &mut GameState) -> Result<Vec<GameEvent>, RuleError>,
{
    let mut engine = RuleEngine::new();
    action(&mut engine, state).map_err(to_js_error)
}

#[derive(Serialize)]
struct AiMoveResponse {
    decision: AiDecision,
    #[serde(skip_serializing_if = "Option::is_none")]
    applied: Option<RuleResolution>,
}

#[wasm_bindgen]
pub struct GameEngine {
    state: GameState,
}

#[wasm_bindgen]
impl GameEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(initial_state_json: Option<String>) -> Result<GameEngine, JsValue> {
        let state = if let Some(json) = initial_state_json {
            serde_json::from_str(&json).map_err(serde_to_js_error)?
        } else {
            GameState::sample()
        };
        Ok(GameEngine { state })
    }

    pub fn state_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.state).map_err(serde_to_js_error)
    }

    pub fn set_state_json(&mut self, json: &str) -> Result<(), JsValue> {
        let state: GameState = serde_json::from_str(json).map_err(serde_to_js_error)?;
        self.state = state;
        Ok(())
    }

    pub fn play_card_json(&mut self, action_json: &str) -> Result<String, JsValue> {
        let action: PlayCardAction =
            serde_json::from_str(action_json).map_err(serde_to_js_error)?;
        let events = execute_with_engine(&mut self.state, |engine, state| {
            engine.play_card(state, action.clone())
        })?;
        make_resolution_json(resolution_from_events(&self.state, events))
    }

    pub fn mulligan_json(&mut self, action_json: &str) -> Result<String, JsValue> {
        let action: MulliganAction = serde_json::from_str(action_json).map_err(serde_to_js_error)?;
        let events = execute_with_engine(&mut self.state, |engine, state| {
            engine.mulligan(state, action.clone())
        })?;
        make_resolution_json(resolution_from_events(&self.state, events))
    }

    pub fn attack_json(&mut self, action_json: &str) -> Result<String, JsValue> {
        let action: AttackAction = serde_json::from_str(action_json).map_err(serde_to_js_error)?;
        let events = execute_with_engine(&mut self.state, |engine, state| {
            engine.attack(state, action.clone())
        })?;
        make_resolution_json(resolution_from_events(&self.state, events))
    }

    pub fn start_turn(&mut self, player_id: u8) -> Result<String, JsValue> {
        let mut engine = RuleEngine::new();
        let events = engine
            .start_turn(&mut self.state, player_id)
            .map_err(to_js_error)?;
        make_resolution_json(resolution_from_events(&self.state, events))
    }

    pub fn end_turn(&mut self) -> Result<String, JsValue> {
        let mut engine = RuleEngine::new();
        let events = engine.end_turn(&mut self.state).map_err(to_js_error)?;
        make_resolution_json(resolution_from_events(&self.state, events))
    }

    pub fn advance_phase(&mut self) -> Result<String, JsValue> {
        RuleEngine::advance_phase(&mut self.state).map_err(to_js_error)?;
        make_resolution_json(resolution_from_events(&self.state, Vec::new()))
    }

    pub fn apply_ai_move(
        &mut self,
        player_id: u8,
        difficulty: Option<String>,
        strategy: Option<String>,
    ) -> Result<String, JsValue> {
        let diff = difficulty
            .as_deref()
            .and_then(|value| AiDifficulty::from_str(value).ok())
            .unwrap_or(AiDifficulty::Normal);
        let mut config = AiConfig::from_difficulty(diff);
        if let Some(strategy) = strategy
            .as_deref()
            .and_then(|value| AiStrategy::from_str(value).ok())
        {
            config = config.with_strategy(strategy);
        }

        // 先克隆状态用于 AI 决策
        let state_for_ai = self.state.clone();
        let mut agent = AiAgent::new(config);
        let decision = agent.decide_action(&state_for_ai, player_id);
        
        // 然后应用决策
        let applied = if let Some(action) = decision.action.clone() {
            Some(self.apply_game_action(action)?)
        } else {
            None
        };

        let response = AiMoveResponse { decision, applied };
        serde_json::to_string(&response).map_err(serde_to_js_error)
    }

    pub fn think_ai(
        &self,
        player_id: u8,
        difficulty: Option<String>,
        strategy: Option<String>,
        delay_ms: Option<u32>,
    ) -> Promise {
        let state = self.state.clone();
        let diff = difficulty
            .and_then(|value| AiDifficulty::from_str(&value).ok())
            .unwrap_or(AiDifficulty::Normal);
        let strat = strategy.and_then(|value| AiStrategy::from_str(&value).ok());
        let delay = delay_ms.unwrap_or(0);

        future_to_promise(async move {
            if delay > 0 {
                TimeoutFuture::new(delay).await;
            }
            let mut config = AiConfig::from_difficulty(diff);
            if let Some(strategy) = strat {
                config = config.with_strategy(strategy);
            }
            let mut agent = AiAgent::new(config);
            let decision = agent.decide_action(&state, player_id);
            let json = serde_json::to_string(&decision).map_err(serde_to_js_error)?;
            Ok(JsValue::from_str(&json))
        })
    }

    fn apply_game_action(&mut self, action: GameAction) -> Result<RuleResolution, JsValue> {
        match action {
            GameAction::PlayCard { action } => {
                let events = execute_with_engine(&mut self.state, |engine, state| {
                    engine.play_card(state, action.clone())
                })?;
                Ok(resolution_from_events(&self.state, events))
            }
            GameAction::Mulligan { action } => {
                let events = execute_with_engine(&mut self.state, |engine, state| {
                    engine.mulligan(state, action.clone())
                })?;
                Ok(resolution_from_events(&self.state, events))
            }
            GameAction::Attack { action } => {
                let events = execute_with_engine(&mut self.state, |engine, state| {
                    engine.attack(state, action.clone())
                })?;
                Ok(resolution_from_events(&self.state, events))
            }
            GameAction::EndTurn => {
                let mut engine = RuleEngine::new();
                let events = engine.end_turn(&mut self.state).map_err(to_js_error)?;
                Ok(resolution_from_events(&self.state, events))
            }
        }
    }
}

/// 返回一个示例游戏状态，方便前端调试或初始化。
#[wasm_bindgen(js_name = "createGameState")]
pub fn create_game_state() -> Result<JsValue, JsValue> {
    to_value(&GameState::sample()).map_err(JsValue::from)
}

/// 将传入的游戏状态进行深拷贝后返回。
#[wasm_bindgen(js_name = "cloneGameState")]
pub fn clone_game_state(state: JsValue) -> Result<JsValue, JsValue> {
    let state: GameState = from_value(state).map_err(JsValue::from)?;
    let cloned = state.clone();
    to_value(&cloned).map_err(JsValue::from)
}

/// 解析指定卡牌的效果，并返回更新后的状态与触发事件。
#[wasm_bindgen(js_name = "applyCardEffects")]
pub fn apply_card_effects(
    state: JsValue,
    card: JsValue,
    context: JsValue,
) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let card: Card = from_value(card).map_err(JsValue::from)?;
    let context: EffectContext = from_value(context).map_err(JsValue::from)?;

    let mut engine = EffectEngine::default();
    engine.queue_card_effects(&card, context);
    let events = engine.resolve_all(&mut state);

    to_value(&make_resolution(state, events)).map_err(JsValue::from)
}

#[wasm_bindgen(js_name = "playCard")]
pub fn play_card(state: JsValue, action: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let action: PlayCardAction = from_value(action).map_err(JsValue::from)?;
    let mut engine = RuleEngine::new();
    match engine.play_card(&mut state, action) {
        Ok(events) => to_value(&make_resolution(state, events)).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "mulligan")]
pub fn mulligan(state: JsValue, action: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let action: MulliganAction = from_value(action).map_err(JsValue::from)?;
    let mut engine = RuleEngine::new();
    match engine.mulligan(&mut state, action) {
        Ok(events) => to_value(&make_resolution(state, events)).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "attack")]
pub fn attack(state: JsValue, action: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let action: AttackAction = from_value(action).map_err(JsValue::from)?;
    let mut engine = RuleEngine::new();
    match engine.attack(&mut state, action) {
        Ok(events) => to_value(&make_resolution(state, events)).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "startTurn")]
pub fn start_turn(state: JsValue, player_id: u8) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let mut engine = RuleEngine::new();
    match engine.start_turn(&mut state, player_id) {
        Ok(events) => to_value(&make_resolution(state, events)).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "endTurn")]
pub fn end_turn(state: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let mut engine = RuleEngine::new();
    match engine.end_turn(&mut state) {
        Ok(events) => to_value(&make_resolution(state, events)).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "advancePhase")]
pub fn advance_phase(state: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    match RuleEngine::advance_phase(&mut state) {
        Ok(_) => to_value(&make_resolution(state, Vec::new())).map_err(JsValue::from),
        Err(error) => Err(to_js_error(error)),
    }
}

#[wasm_bindgen(js_name = "checkVictory")]
pub fn check_victory(state: JsValue) -> Result<JsValue, JsValue> {
    let mut state: GameState = from_value(state).map_err(JsValue::from)?;
    let outcome = RuleEngine::check_victory(&mut state);
    to_value(&outcome).map_err(JsValue::from)
}

#[wasm_bindgen(js_name = "validateState")]
pub fn validate_state(state: JsValue) -> Result<(), JsValue> {
    let state: GameState = from_value(state).map_err(JsValue::from)?;
    state
        .integrity_check()
        .map_err(|error| to_js_error(RuleError::IntegrityViolation { error }))?;
    Ok(())
}

#[wasm_bindgen(js_name = "computeAiMove")]
pub fn compute_ai_move(
    state: JsValue,
    player_id: u8,
    difficulty: Option<String>,
    strategy: Option<String>,
) -> Result<JsValue, JsValue> {
    let state: GameState = from_value(state).map_err(JsValue::from)?;
    let difficulty = difficulty
        .as_deref()
        .and_then(|value| AiDifficulty::from_str(value).ok())
        .unwrap_or(AiDifficulty::Normal);
    let mut config = AiConfig::from_difficulty(difficulty);
    if let Some(strategy) = strategy
        .as_deref()
        .and_then(|value| AiStrategy::from_str(value).ok())
    {
        config = config.with_strategy(strategy);
    }
    let mut agent = AiAgent::new(config);
    let decision = agent.decide_action(&state, player_id);
    to_value(&decision).map_err(JsValue::from)
}

#[cfg(feature = "console_error_panic_hook")]
fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

#[cfg(not(feature = "console_error_panic_hook"))]
fn set_panic_hook() {}
