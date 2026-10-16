"""Firing schedules: how fast a kiln heats, and how long it holds.

A schedule is a list of segments. Each segment ramps to a target temperature, then holds it:

```python
from pottery.firing import Schedule

schedule = Schedule("Glaze, cone 6").ramp(150, to=600).ramp(250, to=1220, hold=15)
print(schedule.duration)  # minutes
```
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from pottery.clay import ClayBody

ROOM_TEMPERATURE = 20
"""Temperature a firing starts from, in degrees Celsius."""


class FiringError(ValueError):
    """A schedule cannot be fired safely."""


@dataclass(frozen=True)
class Segment:
    """One step of a schedule: heat (or cool) at a steady rate, then hold.

    Attributes:
        rate: Heating rate in degrees per hour. Negative to cool down.
        target: Temperature to reach, in degrees Celsius.
        hold: Minutes to stay at the target temperature.
    """

    rate: int
    target: int
    hold: int = 0


class Schedule:
    """An ordered list of segments, from room temperature to the peak.

    Build a schedule with `ramp`, or start from a ready-made one
    with `bisque`.

    Args:
        name: Label shown on the kiln controller.
        segments: Initial segments, in firing order.

    Raises:
        FiringError: If a segment has a rate of zero.
    """

    def __init__(self, name: str, segments: list[Segment] | None = None) -> None:
        self.name = name
        """Label shown on the kiln controller."""
        self.segments: list[Segment] = []
        """Segments, in firing order."""
        for segment in segments or []:
            self._add(segment)

    @classmethod
    def bisque(cls, *, fast: bool = False) -> Schedule:
        """A first firing, for raw pieces.

        Args:
            fast: Use a quicker schedule, for thin and fully dry pieces only.

        Returns:
            A schedule peaking at 1000 °C.
        """
        rate = 150 if fast else 80
        return cls("Bisque").ramp(rate, to=600).ramp(150, to=1000, hold=10)

    @property
    def peak(self) -> int:
        """Highest temperature reached, in degrees Celsius."""
        return max((s.target for s in self.segments), default=ROOM_TEMPERATURE)

    @property
    def duration(self) -> float:
        """Total length of the firing, in minutes, holds included."""
        return sum(minutes for _, minutes in self.steps())

    def ramp(self, rate: int, *, to: int, hold: int = 0) -> Schedule:
        """Append a segment and return the schedule, so that calls can be chained.

        Args:
            rate: Heating rate in degrees per hour. Negative to cool down.
            to: Temperature to reach, in degrees Celsius.
            hold: Minutes to stay at `to`.

        Returns:
            This schedule.

        Raises:
            FiringError: If `rate` is zero, or heats towards a lower temperature.
        """
        self._add(Segment(rate, to, hold))
        return self

    def steps(self) -> Iterator[tuple[int, float]]:
        """Walk through the firing.

        Yields:
            The temperature reached at the end of each ramp and hold, with the minutes it took.
        """
        temperature = ROOM_TEMPERATURE
        for segment in self.segments:
            yield segment.target, abs(segment.target - temperature) / abs(segment.rate) * 60
            if segment.hold:
                yield segment.target, segment.hold
            temperature = segment.target

    def check(self, clay: ClayBody) -> None:
        """Make sure a clay body can go through this firing.

        Args:
            clay: Clay of the pieces to fire.

        Raises:
            FiringError: If the peak is outside the clay's firing range.

        Warning:
            A clay fired above its range can slump or melt onto the kiln shelf.
        """
        if not clay.accepts(self.peak):
            raise FiringError(f"{clay.name} cannot be fired at {self.peak} °C")

    def _add(self, segment: Segment) -> None:
        last = self.segments[-1].target if self.segments else ROOM_TEMPERATURE
        if segment.rate == 0 or (segment.rate > 0) != (segment.target > last):
            raise FiringError(f"segment to {segment.target} °C never reaches its target")
        self.segments.append(segment)


def cone(temperature: int) -> str:
    """Name the pyrometric cone that bends at a temperature.

    Args:
        temperature: Peak temperature in degrees Celsius, at a 150 °C/h final ramp.

    Returns:
        The cone name, e.g. `"06"` or `"6"`.

    Note:
        Cones measure heat work, not temperature: a slower final ramp bends them earlier.

    Examples:
        >>> cone(1222)
        '6'
    """
    cones = [(999, "06"), (1063, "04"), (1186, "4"), (1222, "6"), (1285, "10")]
    return next((name for limit, name in cones if temperature <= limit), "10+")
