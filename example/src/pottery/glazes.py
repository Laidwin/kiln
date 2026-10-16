"""Glaze recipes and batch weights."""

from __future__ import annotations

from typing import Literal

Finish = Literal["glossy", "satin", "matte"]
"""Surface a glaze fires to."""


class Glaze:
    """A glaze recipe, as percentages of dry materials.

    Args:
        name: Name of the glaze.
        recipe: Material names mapped to their share of the dry weight, in percent.
        finish: Surface after firing.
        colorants: Oxides added on top of the base recipe, in percent.

    Raises:
        ValueError: If the base recipe does not add up to 100.
    """

    def __init__(
        self,
        name: str,
        recipe: dict[str, float],
        finish: Finish = "glossy",
        colorants: dict[str, float] | None = None,
    ) -> None:
        if round(sum(recipe.values()), 3) != 100:
            raise ValueError(f"{name}: the recipe adds up to {sum(recipe.values())}, not 100")
        self.name = name
        """Name of the glaze."""
        self.recipe = recipe
        """Base materials, in percent of the dry weight."""
        self.finish: Finish = finish
        """Surface after firing."""
        self.colorants = colorants or {}
        """Oxides added on top of the base recipe, in percent."""

    def batch(self, grams: float) -> dict[str, float]:
        """Weigh every material for a batch. See `mix`."""
        return mix(self.recipe | self.colorants, grams)


def mix(recipe: dict[str, float], grams: float = 1000, *, precision: int = 1) -> dict[str, float]:
    """Weigh the materials of a recipe for a batch of dry glaze.

    Args:
        recipe: Material names mapped to their share, in percent.
        grams: Weight of the base materials, colorants excluded.
        precision: Decimals to round each weight to.

    Returns:
        Material names mapped to their weight in grams.

    Raises:
        ValueError: If `grams` is not positive.

    Examples:
        >>> mix({"Silica": 30, "Feldspar": 40, "Whiting": 20, "Kaolin": 10}, 500)
        {'Silica': 150.0, 'Feldspar': 200.0, 'Whiting': 100.0, 'Kaolin': 50.0}
    """
    if grams <= 0:
        raise ValueError("grams must be positive")
    return {material: round(share * grams / 100, precision) for material, share in recipe.items()}


CELADON = Glaze(
    "Celadon",
    {"Feldspar": 40, "Silica": 30, "Whiting": 20, "Kaolin": 10},
    colorants={"Red iron oxide": 1.5},
)
"""A pale green, glossy high-fire glaze."""
