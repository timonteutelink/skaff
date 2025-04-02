localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { system, ... }: {
    # A copy of hello that was defined by this flake, not the user's flake.
    formatter =
      localFlake.withSystem system ({ pkgs, config, ... }: pkgs.nixfmt-classic);
  };
}

