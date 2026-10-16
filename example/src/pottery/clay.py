"""Clay bodies and the temperatures they mature at."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ClayBody:
    """A clay body, as sold by a ceramic supplier.

    Attributes:
        name: Commercial name of the clay.
        min_temperature: Lowest firing temperature, in degrees Celsius.
        max_temperature: Highest firing temperature, in degrees Celsius.
        shrinkage: Linear shrinkage from wet to fired, between 0 and 1.
    """

    name: str
    min_temperature: int
    max_temperature: int
    shrinkage: float = 0.12

    def accepts(self, temperature: int) -> bool:
        """Tell whether the clay can be fired at a temperature.

        Args:
            temperature: Peak temperature of the firing, in degrees Celsius.

        Returns:
            `True` if the temperature is within the clay's firing range.
        """
        return self.min_temperature <= temperature <= self.max_temperature

    def wet_size(self, fired_size: float) -> float:
        """Size to throw or build a piece at, to get a given size once fired.

        Args:
            fired_size: Wanted size after firing, in any unit.

        Returns:
            The size to give the wet piece, in the same unit.

        Examples:
            >>> STONEWARE.wet_size(20)
            22.727272727272727
        """
        return fired_size / (1 - self.shrinkage)


EARTHENWARE = ClayBody("Red earthenware", 1000, 1120, shrinkage=0.08)
"""A low-fire red clay."""

STONEWARE = ClayBody("Buff stoneware", 1200, 1300)
"""A mid to high-fire stoneware, the most common studio clay."""

PORCELAIN = ClayBody("Porcelain", 1240, 1320, shrinkage=0.14)
"""A white, translucent high-fire clay."""
