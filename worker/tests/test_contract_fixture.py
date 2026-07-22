"""Cross-language contract regression test.

`worker/tests/fixtures/job_config_contract.json` exercises every optional field of the
job-config contract described in `mmm_worker/jobspec.py`'s docstring. The exact same JSON
content is duplicated in `lib/anthropic/__contract_check.ts` as a `satisfies JobConfig`
compile-time assertion, checked by `npm run typecheck`.

If someone renames/removes a field on either side without updating the other, one of
these two checks breaks — this test is the Python half. There is no automated fixture
sync: when you change one file, update the other by hand (see the comment at the top of
each).
"""

import json
from pathlib import Path

from mmm_core.model import AdstockType, ChannelType, LikelihoodType, SaturationType, TrendType
from mmm_worker.jobspec import parse_job_config

_FIXTURE = Path(__file__).parent / "fixtures" / "job_config_contract.json"


def _load() -> dict:
    return json.loads(_FIXTURE.read_text())


def test_fixture_parses_without_error():
    parse_job_config(_load())


def test_fixture_round_trips_every_optional_field():
    spec = parse_job_config(_load())

    assert len(spec.sources) == 3
    google = spec.sources[1]
    assert google.spec.columns[0].resolved_name() == "google_spend"
    weather = spec.sources[2]
    assert weather.spec.essential is False
    assert weather.spec.columns[0].fill == "interpolate"
    assert spec.sources[0].transforms[0].op == "rename"
    assert spec.sources[0].transforms[0].params == {"from": "rev", "to": "revenue"}

    assert spec.event_dummies[0].name == "dummy_2025w45"
    assert spec.event_dummies[0].weeks == ((2025, 45),)

    assert spec.features[0].op == "lag"
    assert spec.features[0].params == {"weeks": 1}

    ch = spec.model.channels[0]
    assert ch.channel_type is ChannelType.INTENT
    assert ch.adstock is AdstockType.DELAYED
    assert ch.saturation is SaturationType.LOGISTIC
    assert ch.expected_half_life == 1.5
    assert ch.priors.beta_sigma == 0.6
    assert ch.priors.logistic_lam_sigma == 1.5
    assert ch.calibration is not None
    assert ch.calibration.roas == 3.2
    assert ch.calibration.sd == 0.5

    # event dummy name is auto-appended to control_columns
    assert "temperature" in spec.model.control_columns
    assert "dummy_2025w45" in spec.model.control_columns
    assert spec.model.trend_type is TrendType.PIECEWISE
    assert spec.model.n_changepoints == 4
    assert spec.model.likelihood is LikelihoodType.STUDENT_T
    assert spec.model.student_t_nu == 5
    assert spec.model.priors.changepoint_scale == 0.08

    assert spec.sample == {"draws": 500, "tune": 500, "chains": 4, "target_accept": 0.92, "seed": 7}
    assert spec.evaluation.cross_validation is True
    assert spec.evaluation.placebo is True
