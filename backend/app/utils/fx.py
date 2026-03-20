from decimal import Decimal


def convert_to_base_amount(amount_original: Decimal, rate: Decimal) -> Decimal:
    if rate <= 0:
        raise ValueError(f"无效汇率: {rate}")
    return amount_original / rate
