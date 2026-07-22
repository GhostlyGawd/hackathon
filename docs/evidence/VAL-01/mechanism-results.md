# VAL-01 mechanism-correctness results

This chart is generated from the machine-readable score for corpus `0862846c119e68ffc1d1c3962226e2b9b5aa1589e876b8105d3d308425258610`. The bars are point estimates; the line is each metric's required threshold.

~~~mermaid
xychart-beta
    title "Witnessed-conflict precision and recall"
    x-axis ["Precision", "Recall"]
    y-axis "Percent" 0 --> 100
    bar [100.00, 100.00]
    line [95.00, 85.00]
~~~

| Metric | Numerator | Denominator | Estimate | 95% CI | Required |
| --- | ---: | ---: | ---: | ---: | ---: |
| Precision | 48 | 48 | 100.00% | 92.59%–100.00% | 95.00% |
| Recall | 48 | 48 | 100.00% | 92.59%–100.00% | 85.00% |

## Confusion matrix

| | Predicted conflict | Predicted non-conflict |
| --- | ---: | ---: |
| Instrumentable seeded conflict | 48 | 0 |
| Other controlled case | 0 | 72 |

This controlled result is mechanism evidence only. It is not evidence of legal compliance, real-vendor behavior, district adoption, or live GPT-5.6 effectiveness.
