// Copyright (c) OpenAI. All rights reserved.
"use strict";

function safeOuterShadow(
  color = "000000",
  opacity = 0.25,
  angle = 45,
  blur = 3,
  offset = 2
) {
  return {
    type: "outer",
    color,
    opacity,
    angle,
    blur,
    offset,
  };
}

module.exports = {
  safeOuterShadow,
};
