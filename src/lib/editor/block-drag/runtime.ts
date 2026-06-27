import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { pipe } from 'effect/Function'

export const runOption = <A>(effect: Effect.Effect<Option.Option<A>>): A | null =>
  pipe(effect, Effect.runSync, Option.getOrNull)

export const runVoid = (effect: Effect.Effect<void>): void => {
  Effect.runSync(effect)
}

export const runBoolean = <E>(effect: Effect.Effect<void, E>): boolean =>
  pipe(
    effect,
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
    Effect.runSync,
  )
