#!/bin/sh
# The views that answer questions. OpenSCAD gimbal camera:
#   --camera = centre_x,y,z, rot_x,y,z, distance
# rot_x 90 looks horizontally; 0 looks straight down. rot_z spins around Z.
set -e
R=renders; S=podium.scad; IMG=1500,1050
C="0,2000,1150"                     # the middle of the bay

shot() {
  timeout 300 xvfb-run -a openscad -o "$R/$1.png" --imgsize=$IMG \
    --camera="$2" --projection="$3" --colorscheme=Tomorrow $4 "$S" >/dev/null 2>&1
  echo "  $1"
}

# Looking in through the open front, from above right.
shot v1-perspective "$C,64,0,205,13000" p "-D show_version=1"
shot v2-perspective "$C,64,0,205,13000" p "-D show_version=2"
shot v3-perspective "$C,64,0,205,13000" p "-D show_version=3"

# Elevations, enclosure off so the contents are visible.
shot plan  "$C,0,0,0,9000"    o "-D show_version=1 -D show_enclosure=false"
shot side  "$C,90,0,90,9000"  o "-D show_version=1 -D show_enclosure=false"
shot front "$C,90,0,180,8000" o "-D show_version=1 -D show_enclosure=false"

# The cones, with nothing in the way.
shot cones "$C,72,0,215,10000" p "-D show_version=1 -D show_enclosure=false -D show_floor_grid=false -D show_dimensions=false"
