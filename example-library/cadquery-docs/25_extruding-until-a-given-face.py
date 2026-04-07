import cadquery as cq

skyscrapers_locations = [(-16, 1), (-8, 0), (7, 0.2), (17, -1.2)]
angles = iter([15, 0, -8, 10])
skyscrapers = (
    cq.Workplane()
    .pushPoints(skyscrapers_locations)
    .eachpoint(
        lambda loc: (
            cq.Workplane()
            .rect(5, 16)
            .workplane(offset=10)
            .ellipse(3, 8)
            .workplane(offset=10)
            .slot2D(20, 5, 90)
            .loft()
            .rotateAboutCenter((0, 0, 1), next(angles))
            .val()
            .located(loc)
        )
    )
)

result = (
    skyscrapers.transformed((0, -90, 0))
    .moveTo(15, 0)
    .rect(3, 3, forConstruction=True)
    .vertices()
    .circle(1)
    .cutBlind("last")
)

show_object(result)
