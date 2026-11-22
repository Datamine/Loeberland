import { contentText } from './content-runtime.ts';
import type { ActionReceipt } from './types/world.ts';
import type { WorldPoint } from './types/geometry.ts';
interface FuelCar {
  position: WorldPoint | null;
  sample: (distance: number) => WorldPoint;
  refuel: () => unknown;
  state: { owned: boolean; fuel: number };
}
import type { Economy } from './types/controllers.ts';
import { configuredDialogue } from './dialogue-config.ts';
import { fuelCarInRange } from './interaction-access.ts';
import { mapInteractionResult } from './interaction-results.ts';

/** Station purchases never require the car. A can contains one full tank and
 * follows that station's normal pricing, including an empty purse at extortionate pumps. */
export function createFuelDialogue(
  site: { id?: string; label: string; distance?: number; paid?: boolean },
  car: FuelCar,
  economy: Economy,
  onChange: () => unknown = () => {},
  {
    npc = null,
    refuel = null,
  }: {
    npc?: WorldPoint | null;
    refuel?: (() => ActionReceipt | Promise<ActionReceipt>) | null;
  } = {},
) {
  const near = () => fuelCarInRange(car, site, npc);
  const person = configuredDialogue(
    site.paid ? 'fuel-paid' : 'fuel-free',
    { name: site.label, shirt: site.paid ? '#a06865' : '#709d8b' },
    {
      refuel: () => {
        if (!near())
          return {
            ok: false,
            message: contentText(
              'world-message.src.fuel.the-ferrari-is-too-far-from-this-pump-take-a-fuel-can-back-to',
            ),
          };
        if (refuel)
          return Promise.resolve(refuel()).then((result) => {
            onChange();
            return {
              ...result,
              message: result.ok
                ? contentText('world-message.src.fuel.your-tank-is-full-safe-travels')
                : result.message,
            };
          });
        const result = site.paid ? economy.trade('extortion') : { ok: true };
        if (result.ok) car.refuel();
        onChange();
        return {
          ...result,
          message: result.ok
            ? contentText('world-message.src.fuel.your-tank-is-full-safe-travels')
            : result.message,
        };
      },
      fuelCan: () =>
        mapInteractionResult(economy.trade(site.paid ? 'fuel-can' : 'free-fuel-can'), (result) => {
          onChange();
          return {
            ...result,
            message: result.ok
              ? contentText(
                  'world-message.src.fuel.one-full-fuel-can-return-to-your-ferrari-and-choose-use-fuel-c',
                )
              : result.message,
          };
        }),
    },
    {
      fuelPrice: site.paid ? 'all carried coins' : 'Free',
      leaseOffer:
        site.id === 'ferrari-dealer' ? contentText('service.ferrari-dealer.lease-offer') + ' ' : '',
    },
  );
  if (!near()) person.choices = person.choices?.filter((choice) => choice.id !== 'refuel');
  return person;
}

export function refuelFerrariFromCan(car: Pick<FuelCar, 'state' | 'refuel'>, economy: Economy) {
  if (!car.state.owned)
    return {
      ok: false,
      message: contentText('world-message.src.fuel.borrow-the-ferrari-before-using-a-fuel-can'),
    };
  if (car.state.fuel >= 1 - 1e-9)
    return {
      ok: false,
      message: contentText(
        'world-message.src.fuel.the-ferrari-already-has-a-full-tank-you-keep-your-fuel-can',
      ),
    };
  const result = economy.trade('use-fuel-can'),
    remote = !!(result?.promise || result instanceof Promise);
  return mapInteractionResult(result, (receipt) => {
    if (!receipt.ok) return receipt;
    // Online gameplay already filled the authoritative car. Do not send a
    // second refuel command or predict fuel before that receipt arrives.
    if (!remote) car.refuel();
    return {
      ...receipt,
      message: contentText(
        'world-message.src.fuel.you-pour-the-fuel-can-into-the-ferrari-a-full-tank-ready-to-go',
      ),
    };
  });
}
