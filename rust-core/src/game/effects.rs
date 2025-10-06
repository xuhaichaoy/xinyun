use std::cmp::Ordering;
use std::collections::BinaryHeap;

use serde::{Deserialize, Serialize};

use super::state::{Card, CardEffect, CardId, EffectId, GameEvent, GameState, PlayerId};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum EffectTrigger {
    OnPlay,
    OnDeath,
    OnTurnStart,
    OnTurnEnd,
    OnAttack,
    Passive,
}

impl Default for EffectTrigger {
    fn default() -> Self {
        EffectTrigger::OnPlay
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum EffectTarget {
    ContextTarget,
    SourcePlayer,
    TargetPlayer,
    OpponentOfSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum EffectCondition {
    PlayerHealthBelow {
        target: EffectTarget,
        threshold: i16,
    },
    PlayerManaAtLeast {
        target: EffectTarget,
        amount: u8,
    },
    BoardCountAtLeast {
        target: EffectTarget,
        min: usize,
    },
    Any {
        conditions: Vec<EffectCondition>,
    },
    All {
        conditions: Vec<EffectCondition>,
    },
}

impl EffectCondition {
    pub fn is_satisfied(&self, ctx: &EffectContext, state: &GameState) -> bool {
        match self {
            EffectCondition::PlayerHealthBelow { target, threshold } => {
                target
                    .resolve_player(ctx, state)
                    .and_then(|id| state.get_player(id))
                    .map(|player| player.health < *threshold)
                    .unwrap_or(false)
            }
            EffectCondition::PlayerManaAtLeast { target, amount } => target
                .resolve_player(ctx, state)
                .and_then(|id| state.get_player(id))
                .map(|player| player.mana >= *amount)
                .unwrap_or(false),
            EffectCondition::BoardCountAtLeast { target, min } => target
                .resolve_player(ctx, state)
                .and_then(|id| state.get_player(id))
                .map(|player| player.board.len() >= *min)
                .unwrap_or(false),
            EffectCondition::Any { conditions } => conditions
                .iter()
                .any(|condition| condition.is_satisfied(ctx, state)),
            EffectCondition::All { conditions } => conditions
                .iter()
                .all(|condition| condition.is_satisfied(ctx, state)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum EffectKind {
    DirectDamage {
        amount: i16,
        target: EffectTarget,
    },
    Heal {
        amount: i16,
        target: EffectTarget,
    },
    DrawCard {
        count: u8,
        target: EffectTarget,
    },
    Composite {
        effects: Vec<EffectKind>,
    },
    Conditional {
        condition: Box<EffectCondition>,
        effect: Box<EffectKind>,
    },
}

impl EffectKind {
    pub fn can_trigger(&self, ctx: &EffectContext, state: &GameState) -> bool {
        match self {
            EffectKind::DirectDamage { .. } | EffectKind::Heal { .. } => true,
            EffectKind::DrawCard { target, .. } => target
                .resolve_player(ctx, state)
                .and_then(|id| state.get_player(id))
                .map(|player| !player.deck.is_empty())
                .unwrap_or(false),
            EffectKind::Composite { effects } => effects
                .iter()
                .any(|effect| effect.can_trigger(ctx, state)),
            EffectKind::Conditional { condition, effect } => {
                condition.is_satisfied(ctx, state) && effect.can_trigger(ctx, state)
            }
        }
    }

    pub fn apply(&self, ctx: &EffectContext, state: &mut GameState) -> EffectResolution {
        match self {
            EffectKind::DirectDamage { amount, target } => {
                let mut events = Vec::new();
                if let Some(card_id) = ctx.target_card {
                    if let Some(target_owner) = ctx.target_player {
                        let res = state.damage_card(
                            ctx.source_player,
                            ctx.source_card,
                            target_owner,
                            card_id,
                            *amount,
                        );
                        events.extend(res);
                    }
                } else if let Some(target_player) = target.resolve_player(ctx, state) {
                    if let Some(event) =
                        state.damage_player(ctx.source_player, ctx.source_card, target_player, *amount)
                    {
                        events.push(event);
                    }
                }
                EffectResolution { events }
            }
            EffectKind::Heal { amount, target } => {
                let mut events = Vec::new();
                if let Some(card_id) = ctx.target_card {
                    if let Some(target_owner) = ctx.target_player {
                        if let Some(event) =
                            state.heal_card(target_owner, card_id, *amount)
                        {
                            events.push(event);
                        }
                    }
                } else if let Some(target_player) = target.resolve_player(ctx, state) {
                    if let Some(event) = state.heal_player(target_player, *amount) {
                        events.push(event);
                    }
                }
                EffectResolution { events }
            }
            EffectKind::DrawCard { count, target } => {
                let mut events = Vec::new();
                if let Some(target_player) = target.resolve_player(ctx, state) {
                    for _ in 0..*count {
                        if let Some(event) = state.draw_card(target_player) {
                            events.push(event);
                        }
                    }
                }
                EffectResolution { events }
            }
            EffectKind::Composite { effects } => {
                let mut resolution = EffectResolution::default();
                for effect in effects {
                    let res = effect.apply(ctx, state);
                    resolution.extend(res);
                }
                resolution
            }
            EffectKind::Conditional { condition, effect } => {
                if condition.is_satisfied(ctx, state) {
                    effect.apply(ctx, state)
                } else {
                    EffectResolution::default()
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EffectContext {
    pub trigger: EffectTrigger,
    pub source_player: PlayerId,
    pub source_card: Option<CardId>,
    pub target_player: Option<PlayerId>,
    pub target_card: Option<CardId>,
    pub current_player: PlayerId,
}

impl EffectContext {
    pub fn new(trigger: EffectTrigger, source_player: PlayerId, current_player: PlayerId) -> Self {
        Self {
            trigger,
            source_player,
            source_card: None,
            target_player: None,
            target_card: None,
            current_player,
        }
    }

    pub fn with_source_card(mut self, card_id: CardId) -> Self {
        self.source_card = Some(card_id);
        self
    }

    pub fn with_target_player(mut self, player_id: PlayerId) -> Self {
        self.target_player = Some(player_id);
        self
    }

    pub fn with_target_card(mut self, player_id: PlayerId, card_id: CardId) -> Self {
        self.target_player = Some(player_id);
        self.target_card = Some(card_id);
        self
    }
}

impl EffectTarget {
    fn resolve_player(&self, ctx: &EffectContext, state: &GameState) -> Option<PlayerId> {
        match self {
            EffectTarget::ContextTarget => ctx.target_player,
            EffectTarget::SourcePlayer => Some(ctx.source_player),
            EffectTarget::TargetPlayer => ctx.target_player,
            EffectTarget::OpponentOfSource => state
                .players
                .iter()
                .find(|p| p.id != ctx.source_player)
                .map(|player| player.id),
        }
    }
}

#[derive(Default, Debug, Clone)]
pub struct EffectResolution {
    pub events: Vec<GameEvent>,
}

impl EffectResolution {
    pub fn extend(&mut self, mut other: EffectResolution) {
        self.events.append(&mut other.events);
    }
}

#[derive(Debug, Clone)]
struct StackItem {
    entry_id: EffectId,
    priority: i8,
    order: u64,
    effect: CardEffect,
    context: EffectContext,
}

impl PartialEq for StackItem {
    fn eq(&self, other: &Self) -> bool {
        self.entry_id == other.entry_id && self.order == other.order
    }
}

impl Eq for StackItem {}

impl PartialOrd for StackItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for StackItem {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.order.cmp(&self.order))
    }
}

#[derive(Default)]
pub struct EffectStack {
    heap: BinaryHeap<StackItem>,
    order: u64,
}

impl EffectStack {
    pub fn push(&mut self, effect: CardEffect, context: EffectContext) {
        self.order += 1;
        self.heap.push(StackItem {
            entry_id: effect.id,
            priority: effect.priority,
            order: self.order,
            effect,
            context,
        });
    }

    fn pop(&mut self) -> Option<StackItem> {
        self.heap.pop()
    }

    pub fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }
}

#[derive(Default)]
pub struct EffectEngine {
    stack: EffectStack,
}

impl EffectEngine {
    pub fn queue_card_effects(&mut self, card: &Card, base_context: EffectContext) {
        for effect in &card.effects {
            if effect.trigger == base_context.trigger {
                self.stack.push(effect.clone(), base_context.clone());
            }
        }
    }

    pub fn queue_effect(&mut self, effect: CardEffect, context: EffectContext) {
        self.stack.push(effect, context);
    }

    pub fn resolve_all(&mut self, state: &mut GameState) -> Vec<GameEvent> {
        let mut events = Vec::new();
        while let Some(item) = self.stack.pop() {
            if !item.effect.can_trigger(&item.context, state) {
                continue;
            }

            let mut resolution = item.effect.apply(&item.context, state);
            for event in &resolution.events {
                state.record_event(event.clone());
                if let GameEvent::CardDestroyed { player_id, card } = event {
                    let death_ctx = EffectContext::new(EffectTrigger::OnDeath, *player_id, state.current_player)
                        .with_source_card(card.id);
                    self.queue_card_effects(card, death_ctx);
                }
            }
            events.extend(resolution.events.drain(..));
        }
        events
    }

    pub fn stack(&self) -> &EffectStack {
        &self.stack
    }
}

impl CardEffect {
    pub fn can_trigger(&self, ctx: &EffectContext, state: &GameState) -> bool {
        if let Some(condition) = &self.condition {
            if !condition.is_satisfied(ctx, state) {
                return false;
            }
        }
        self.kind.can_trigger(ctx, state)
    }

    pub fn apply(&self, ctx: &EffectContext, state: &mut GameState) -> EffectResolution {
        self.kind.apply(ctx, state)
    }
}
