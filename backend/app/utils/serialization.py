from decimal import Decimal


# Centralized conversion helper for Decimal in JSON payloads.
def decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)
